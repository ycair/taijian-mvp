import { FieldValue } from 'firebase-admin/firestore';
import { AppError, can, type Action, type CommandResult, type Role } from '@taijian/domain';
import { db, type Tx } from '../lib/firestore';
import type { HandlerContext } from './types';

/** Fields every handler may rely on for optimistic concurrency. */
export type RevisionedDoc = {
  revision: number;
  lastChangedFields?: string[];
};

export type HouseholdDoc = RevisionedDoc & {
  id: string;
  ownerUid: string;
  ownerCount: number;
  memberCount: number;
  deletedAt?: unknown;
  [key: string]: unknown;
};

export type UserProfile = {
  displayName: string;
  avatarUrl: string;
  defaultHouseholdId?: string;
};

/** Bot-originated commands are audited as `bot`; everything else as `user`. */
export function actorTypeFor(ctx: HandlerContext): 'user' | 'bot' {
  return ctx.source === 'bot' ? 'bot' : 'user';
}

export function requireHouseholdId(ctx: HandlerContext): string {
  if (!ctx.envelope.householdId) {
    throw new AppError('VALIDATION_ERROR', 'householdId is required');
  }
  return ctx.envelope.householdId;
}

export type MemberContext = { role: Role; displayName: string | null };

export async function requireMember(
  tx: Tx,
  householdId: string,
  uid: string,
): Promise<MemberContext> {
  const snap = await tx.get(db.doc(`households/${householdId}/members/${uid}`));
  if (!snap.exists) throw new AppError('FORBIDDEN', 'not a household member');
  const data = snap.data() as { role?: Role; displayName?: string } | undefined;
  const displayName = data?.displayName?.trim();
  return { role: data?.role as Role, displayName: displayName ? displayName : null };
}

export function assertCan(role: Role, action: Action): void {
  if (!can(role, action)) throw new AppError('FORBIDDEN', `role ${role} cannot ${action}`);
}

export function assertRevision(doc: RevisionedDoc, baseRevision: number | undefined): void {
  if (baseRevision === undefined) {
    throw new AppError('VALIDATION_ERROR', 'baseRevision is required');
  }
  if (doc.revision !== baseRevision) {
    throw new AppError('CONFLICT', 'stale revision', {
      current: doc,
      currentRevision: doc.revision,
      lastChangedFields: doc.lastChangedFields ?? [],
    });
  }
}

export function bump(
  doc: RevisionedDoc,
  patch: Record<string, unknown>,
  ctx: HandlerContext,
): Record<string, unknown> {
  return {
    ...patch,
    revision: doc.revision + 1,
    lastChangedFields: Object.keys(patch),
    updatedBy: ctx.uid,
    updatedAt: FieldValue.serverTimestamp(),
    updatedFrom: ctx.source,
  };
}

export async function mustGetHousehold(tx: Tx, householdId: string): Promise<HouseholdDoc> {
  const snap = await tx.get(db.collection('households').doc(householdId));
  if (!snap.exists) throw new AppError('NOT_FOUND', 'household not found');
  const data = snap.data() as Record<string, unknown>;
  // A soft-deleted household behaves like a missing one.
  if (data.deletedAt != null) throw new AppError('NOT_FOUND', 'household not found');
  return { ...data, id: snap.id } as HouseholdDoc;
}

export function success(ctx: HandlerContext, data: unknown, revision?: number): CommandResult {
  return {
    ok: true,
    commandId: ctx.envelope.commandId,
    ...(revision !== undefined ? { revision } : {}),
    data,
    serverTime: ctx.now.toISOString(),
  };
}

/**
 * Ensures the caller has a profile document before anything references the UID.
 *
 * `lineUsers/{sub}.uid` is the canonical identity and `lineLogin` refuses a
 * mapped UID without a `users/{uid}` document, so every command that can be the
 * first write for a user (creating a household, linking LINE, accepting an
 * invite) must create the profile first.
 */
export async function ensureUserDoc(tx: Tx, uid: string): Promise<UserProfile> {
  const ref = db.collection('users').doc(uid);
  const snap = await tx.get(ref);

  if (snap.exists) {
    const data = snap.data() as
      { displayName?: string; avatarUrl?: string; defaultHouseholdId?: string } | undefined;
    return {
      displayName: data?.displayName?.trim() || uid,
      avatarUrl: data?.avatarUrl ?? '',
      ...(typeof data?.defaultHouseholdId === 'string'
        ? { defaultHouseholdId: data.defaultHouseholdId }
        : {}),
    };
  }

  tx.set(ref, {
    displayName: uid,
    avatarUrl: '',
    householdIds: [],
    locale: 'zh-TW',
    timezone: 'Asia/Taipei',
    schemaVersion: 1,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { displayName: uid, avatarUrl: '' };
}

/**
 * Removes a household from a user's `householdIds` and clears `defaultHouseholdId`
 * when it pointed at that household (falling back to the first remaining one).
 * Reads the profile first, so call it before any write in the transaction.
 */
export async function detachHouseholdFromUser(
  tx: Tx,
  uid: string,
  householdId: string,
): Promise<void> {
  const ref = db.collection('users').doc(uid);
  const snap = await tx.get(ref);
  if (!snap.exists) return;

  const data = snap.data() as { householdIds?: string[]; defaultHouseholdId?: string } | undefined;
  const patch: Record<string, unknown> = {
    householdIds: FieldValue.arrayRemove(householdId),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (data?.defaultHouseholdId === householdId) {
    const remaining = (data.householdIds ?? []).filter((id) => id !== householdId);
    patch.defaultHouseholdId = remaining[0] ?? FieldValue.delete();
  }
  tx.set(ref, patch, { merge: true });
}

/**
 * Household counter fields (`memberCount`, `ownerCount`) are non-revisioned
 * metadata: they change without bumping `revision`, because a revision bump
 * would produce false `CONFLICT`s for editors who never touched membership.
 * Member document listeners remain the authoritative membership source.
 */
export function counterPatch(
  ctx: HandlerContext,
  counters: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...counters,
    updatedBy: ctx.uid,
    updatedFrom: ctx.source,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

/**
 * Keeps `household.ownerUid` pointing at a live owner. When `leavingUid` is the
 * recorded owner, returns the UID of another owner; throws `LAST_OWNER` when no
 * replacement exists so the field can never dangle. Returns `undefined` when
 * `leavingUid` is not the recorded owner and the field should stay put.
 */
export async function nextOwnerUid(
  tx: Tx,
  householdId: string,
  household: HouseholdDoc,
  leavingUid: string,
): Promise<string | undefined> {
  if (household.ownerUid !== leavingUid) return undefined;
  const owners = await tx.get(
    db.collection(`households/${householdId}/members`).where('role', '==', 'owner').limit(2),
  );
  const replacement = owners.docs.find((doc) => doc.id !== leavingUid);
  if (!replacement) {
    throw new AppError('LAST_OWNER', 'no other owner can inherit the household');
  }
  return replacement.id;
}
