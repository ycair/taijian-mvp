import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { AppError, ID_MAX_LENGTH, newCommandId } from '@taijian/domain';
import { config } from '../config';
import { writeAccountAudit, writeAudit } from '../lib/audit';
import { toHttpsError } from '../lib/errors';
import { db } from '../lib/firestore';
import { consumeRateLimits } from '../lib/rateLimit';
import { detachHouseholdFromUser } from '../commands/helpers';

/** Destructive actions require a fresh sign-in, not a long-lived ID token. */
export const RECENT_AUTH_MAX_AGE_SECONDS = 5 * 60;
/** Clock skew allowance for `auth_time` (seconds since epoch). */
const AUTH_TIME_SKEW_SECONDS = 60;

/** One account-deletion attempt per hour; an admin retry bypasses this. */
export const DELETE_ACCOUNT_LIMIT = 1;
export const DELETE_ACCOUNT_WINDOW_SECONDS = 3600;

export type DeleteAccountResult = {
  deleted: true;
  alreadyDeleted: boolean;
  deletedHouseholds: string[];
  leftHouseholds: string[];
};

/** What deleting one membership did; `stale` means there was nothing to do. */
type MembershipOutcome = 'deleted' | 'left' | 'stale';

type HouseholdData = {
  ownerUid?: string;
  deletedAt?: unknown;
};

type UserData = {
  householdIds?: string[];
  deletedAt?: unknown;
};

export type DeleteAccountOptions = {
  /**
   * The user-facing callable is rate limited. The admin retry path is not: an
   * operator finishing a half-deleted account must be able to do so immediately
   * and repeatedly.
   */
  enforceRateLimit?: boolean;
};

/**
 * A stolen or replayed ID token is not enough to delete an account: the caller
 * must have signed in within the last five minutes.
 */
export function assertRecentAuth(
  token: { auth_time?: unknown } | undefined,
  nowMs: number = Date.now(),
): void {
  const authTime = token?.auth_time;
  if (typeof authTime !== 'number' || !Number.isFinite(authTime)) {
    throw new AppError('UNAUTHENTICATED', 'sign in again before deleting your account');
  }
  const ageSeconds = nowMs / 1000 - authTime;
  if (ageSeconds > RECENT_AUTH_MAX_AGE_SECONDS || ageSeconds < -AUTH_TIME_SKEW_SECONDS) {
    throw new AppError('UNAUTHENTICATED', 'sign in again before deleting your account');
  }
}

async function chargeAccountDeletion(uid: string): Promise<void> {
  await consumeRateLimits(uid, [
    {
      action: 'account.delete',
      limit: DELETE_ACCOUNT_LIMIT,
      windowSeconds: DELETE_ACCOUNT_WINDOW_SECONDS,
    },
  ]);
}

function householdRef(householdId: string): FirebaseFirestore.DocumentReference {
  return db.collection('households').doc(householdId);
}

function memberRef(householdId: string, uid: string): FirebaseFirestore.DocumentReference {
  return db.doc(`households/${householdId}/members/${uid}`);
}

/**
 * Pre-flight check using ordinary reads: an owned household that still has
 * members blocks the whole deletion, before anything has been changed, so the
 * caller can transfer ownership or remove the members and try again.
 */
async function assertNotBlocked(uid: string, householdId: string): Promise<void> {
  const [householdSnap, memberSnap, membersSnap] = await Promise.all([
    householdRef(householdId).get(),
    memberRef(householdId, uid).get(),
    db.collection(`households/${householdId}/members`).limit(2).get(),
  ]);
  if (!householdSnap.exists || householdSnap.data()?.deletedAt != null || !memberSnap.exists) {
    return;
  }
  const household = householdSnap.data() as HouseholdData;
  const owned = memberSnap.data()?.role === 'owner' || household.ownerUid === uid;
  const hasOthers = membersSnap.docs.some((doc) => doc.id !== uid);
  if (owned && hasOthers) {
    throw new AppError(
      'FORBIDDEN',
      'transfer ownership or remove the other members before deleting the account',
    );
  }
}

/**
 * Deletes one membership in its own transaction. Splitting the work keeps any
 * account (even one with hundreds of households) inside Firestore's per-
 * transaction budget, and a crash between households is resumable because
 * `users/{uid}.householdIds` shrinks with every step.
 *
 * The ownership check is repeated here: a member may join after the pre-flight
 * read, and an owned household with members must never be orphaned.
 */
async function deleteMembership(uid: string, householdId: string): Promise<MembershipOutcome> {
  return db.runTransaction(async (tx) => {
    const householdDoc = householdRef(householdId);
    const memberDoc = memberRef(householdId, uid);
    const householdSnap = await tx.get(householdDoc);
    const memberSnap = await tx.get(memberDoc);

    if (!householdSnap.exists || householdSnap.data()?.deletedAt != null || !memberSnap.exists) {
      // A stale pointer is simply dropped from the profile.
      await detachHouseholdFromUser(tx, uid, householdId);
      return 'stale' as const;
    }

    const household = householdSnap.data() as HouseholdData;
    const owned = memberSnap.data()?.role === 'owner' || household.ownerUid === uid;

    // Authoritative membership check: `memberCount` is metadata and may lag.
    const membersSnap = await tx.get(db.collection(`households/${householdId}/members`).limit(2));
    const hasOthers = membersSnap.docs.some((doc) => doc.id !== uid);
    if (owned && hasOthers) {
      throw new AppError(
        'FORBIDDEN',
        'transfer ownership or remove the other members before deleting the account',
      );
    }

    const invitesSnap = owned
      ? await tx.get(db.collection('invites').where('householdId', '==', householdId))
      : null;
    const activeInvites = invitesSnap?.docs.filter((doc) => doc.data().status === 'active') ?? [];

    // Reads the profile, so it must run before the writes below.
    await detachHouseholdFromUser(tx, uid, householdId);

    tx.delete(memberDoc);
    if (owned) {
      for (const invite of activeInvites) {
        tx.set(
          invite.ref,
          {
            status: 'revoked',
            revokedAt: FieldValue.serverTimestamp(),
            revokedBy: uid,
          },
          { merge: true },
        );
      }
      tx.set(
        householdDoc,
        {
          memberCount: 0,
          ownerCount: 0,
          deletedAt: FieldValue.serverTimestamp(),
          updatedBy: uid,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      // The household timeline must show why it disappeared; the account audit
      // entry alone is not visible to a future household reader.
      writeAudit(tx, {
        householdId,
        actorUid: uid,
        actorType: 'user',
        action: 'household.delete',
        targetType: 'household',
        targetId: householdId,
        after: { deleted: true, reason: 'account.delete' },
        commandId: newCommandId(),
        source: 'account.delete',
      });
      return 'deleted' as const;
    }

    tx.set(
      householdDoc,
      {
        memberCount: FieldValue.increment(-1),
        updatedBy: uid,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return 'left' as const;
  });
}

/**
 * Deletes the caller's account.
 *
 * Memberships are resolved through `users/{uid}.householdIds` (the same field
 * `lineLogin` and the household commands maintain) instead of a collection-group
 * query, so no composite index is required and no membership can hide.
 *
 * A household that still has other members is never deleted or orphaned: the
 * caller must transfer ownership or remove the members first. Sole-owner
 * households are soft-deleted with their active invites revoked.
 *
 * LINE mappings are tombstoned (`status: 'deleted'`) rather than removed, so the
 * next `lineLogin` is refused instead of re-creating the account under the same
 * UID. Refresh tokens are revoked before the Auth user is deleted.
 */
export async function deleteAccountData(
  uid: string,
  options: DeleteAccountOptions = {},
): Promise<DeleteAccountResult> {
  const userRef = db.collection('users').doc(uid);
  const initial = (await userRef.get()).data() as UserData | undefined;
  const wasDeleted = initial?.deletedAt != null;
  // A retry after the tombstone is already written is a no-op, not a new
  // deletion: it must stay callable without spending a fresh hourly budget.
  if (!wasDeleted && options.enforceRateLimit !== false) {
    await chargeAccountDeletion(uid);
  }
  const householdIds = wasDeleted ? [] : (initial?.householdIds ?? []);

  // Refuse before changing anything when an owned household still has members.
  for (const householdId of householdIds) {
    await assertNotBlocked(uid, householdId);
  }

  const deletedHouseholds: string[] = [];
  const leftHouseholds: string[] = [];
  for (const householdId of householdIds) {
    const outcome = await deleteMembership(uid, householdId);
    if (outcome === 'deleted') deletedHouseholds.push(householdId);
    if (outcome === 'left') leftHouseholds.push(householdId);
  }

  const alreadyDeleted = await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const wasAlreadyDeleted = userSnap.data()?.deletedAt != null;

    // Tombstone the LINE mappings so the identity can never be resurrected.
    // A retried call must not move the original deletion timestamp.
    const mappings = await tx.get(db.collection('lineUsers').where('uid', '==', uid));
    for (const mapping of mappings.docs) {
      if (mapping.data().status === 'deleted') continue;
      tx.set(
        mapping.ref,
        {
          status: 'deleted',
          deletedAt: FieldValue.serverTimestamp(),
          deletedBy: uid,
        },
        { merge: true },
      );
    }

    if (wasAlreadyDeleted) return true;

    // The profile stays as a tombstone: it carries the account audit trail
    // (`users/{uid}/auditLogs`) and `lineLogin` treats it as unavailable.
    tx.set(
      userRef,
      {
        deletedAt: FieldValue.serverTimestamp(),
        householdIds: [],
        defaultHouseholdId: FieldValue.delete(),
        displayName: '已刪除的使用者',
        avatarUrl: '',
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    writeAccountAudit(tx, uid, {
      actorUid: uid,
      actorType: 'user',
      action: 'account.delete',
      targetType: 'user',
      targetId: uid,
      after: { deletedHouseholds, leftHouseholds },
      commandId: newCommandId(),
      source: 'callable',
    });
    return false;
  });

  // Tokens must die before the user record disappears, otherwise a stolen
  // refresh token could mint an ID token for a user that no longer exists.
  const auth = getAuth();
  await auth.revokeRefreshTokens(uid).catch((error: { code?: string }) => {
    if (error.code !== 'auth/user-not-found') throw error;
  });
  await auth.deleteUser(uid).catch((error: { code?: string }) => {
    if (error.code !== 'auth/user-not-found') throw error;
  });

  return { deleted: true, alreadyDeleted, deletedHouseholds, leftHouseholds };
}

export const deleteAccount = onCall(
  { region: 'asia-east1', enforceAppCheck: config.ENFORCE_APP_CHECK },
  async (request) => {
    try {
      if (!request.auth) throw new AppError('UNAUTHENTICATED', 'sign in required');
      assertRecentAuth(request.auth.token);
      return await deleteAccountData(request.auth.uid);
    } catch (error) {
      throw toHttpsError(error);
    }
  },
);

const AdminRetryInput = z.object({ uid: z.string().min(1).max(ID_MAX_LENGTH) });

/**
 * Operator escape hatch for a half-deleted account (Firestore tombstoned but the
 * Auth user still exists, or a membership left behind). Restricted to tokens
 * carrying the `admin` custom claim; the same routine is idempotent, so a retry
 * never duplicates audit entries or moves the original timestamps.
 */
export const adminRetryDeleteAccount = onCall(
  { region: 'asia-east1', enforceAppCheck: config.ENFORCE_APP_CHECK },
  async (request) => {
    try {
      const token = request.auth?.token as { admin?: unknown } | undefined;
      if (!request.auth || token?.admin !== true) {
        throw new AppError('FORBIDDEN', 'admin only');
      }
      const parsed = AdminRetryInput.safeParse(request.data);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 'invalid payload', { issues: parsed.error.issues });
      }
      return await deleteAccountData(parsed.data.uid, { enforceRateLimit: false });
    } catch (error) {
      throw toHttpsError(error);
    }
  },
);
