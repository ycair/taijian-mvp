import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { AppError, type CommandResult, type Role } from '@taijian/domain';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { writeAudit } from '../../lib/audit';
import { db } from '../../lib/firestore';
import { assertCan, ensureUserDoc, requireHouseholdId, requireMember, success } from '../helpers';
import type { HandlerContext } from '../types';

const DAY_MS = 86_400_000;

type InviteDoc = {
  householdId: string;
  role: string;
  createdBy: string;
  secretHash: string;
  expiresAt: Timestamp;
  maxUses: number;
  usedCount: number;
  status: 'active' | 'used' | 'revoked';
  acceptedBy?: string[];
};

/** Invite secrets are stored as a SHA-256 digest, never in plaintext. */
export function hashInviteSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function parseInviteToken(token: string): { inviteId: string; secret: string } {
  const parts = token.split('.');
  if (parts.length !== 2) throw new AppError('VALIDATION_ERROR', 'invalid invite token');
  const [inviteId, secret] = parts;
  if (!inviteId || !secret) throw new AppError('VALIDATION_ERROR', 'invalid invite token');
  return { inviteId, secret };
}

function secretMatches(expectedHash: string, secret: string): boolean {
  const expected = Buffer.from(expectedHash, 'hex');
  const actual = Buffer.from(hashInviteSecret(secret), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function inviteMember(ctx: HandlerContext): Promise<CommandResult> {
  const householdId = requireHouseholdId(ctx);
  const member = await requireMember(ctx.tx, householdId, ctx.uid);
  assertCan(member.role, 'member.invite');

  const payload = ctx.envelope.payload as { role: Role; expiresInDays: number };
  const inviteRef = db.collection('invites').doc();
  // 256 bits of entropy (the contract requires at least 128).
  const secret = randomBytes(32).toString('base64url');
  const token = `${inviteRef.id}.${secret}`;
  const expiresAt = Timestamp.fromMillis(ctx.now.getTime() + payload.expiresInDays * DAY_MS);

  ctx.tx.set(inviteRef, {
    householdId,
    role: payload.role,
    createdBy: ctx.uid,
    secretHash: hashInviteSecret(secret),
    expiresAt,
    maxUses: 1,
    usedCount: 0,
    status: 'active',
    acceptedBy: [],
    createdAt: FieldValue.serverTimestamp(),
  });
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: 'user',
    action: 'member.invite',
    targetType: 'invite',
    targetId: inviteRef.id,
    after: { role: payload.role, expiresAt: expiresAt.toDate().toISOString() },
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });

  return success(ctx, {
    token,
    inviteId: inviteRef.id,
    expiresAt: expiresAt.toDate().toISOString(),
  });
}

export async function acceptInvite(ctx: HandlerContext): Promise<CommandResult> {
  const payload = ctx.envelope.payload as { token: string };
  const { inviteId, secret } = parseInviteToken(payload.token);

  const inviteRef = db.collection('invites').doc(inviteId);
  const inviteSnap = await ctx.tx.get(inviteRef);
  if (!inviteSnap.exists) throw new AppError('NOT_FOUND', 'invite not found');
  const invite = inviteSnap.data() as InviteDoc;

  // Verify possession before revealing anything about the household or membership.
  if (!secretMatches(invite.secretHash, secret)) {
    throw new AppError('NOT_FOUND', 'invite not found');
  }

  const memberRef = db.doc(`households/${invite.householdId}/members/${ctx.uid}`);
  const memberSnap = await ctx.tx.get(memberRef);
  if (memberSnap.exists) {
    // Replaying an invite link is idempotent: the caller is already in.
    writeAudit(ctx.tx, {
      householdId: invite.householdId,
      actorUid: ctx.uid,
      actorType: 'user',
      action: 'member.accept',
      targetType: 'member',
      targetId: ctx.uid,
      after: { role: memberSnap.data()?.role as Role, alreadyMember: true },
      commandId: ctx.envelope.commandId,
      source: ctx.source,
    });
    return success(ctx, { householdId: invite.householdId, alreadyMember: true });
  }

  // Invites can never grant ownership; transfers go through member.updateRole.
  if (invite.role !== 'caretaker') {
    throw new AppError('VALIDATION_ERROR', 'invites can only grant the caretaker role');
  }
  if (invite.status !== 'active' || invite.usedCount >= invite.maxUses) {
    throw new AppError('INVITE_USED', 'invite has already been used');
  }
  if (invite.expiresAt.toMillis() <= ctx.now.getTime()) {
    throw new AppError('INVITE_EXPIRED', 'invite is no longer valid');
  }

  const householdRef = db.collection('households').doc(invite.householdId);
  const householdSnap = await ctx.tx.get(householdRef);
  if (!householdSnap.exists || householdSnap.data()?.deletedAt != null) {
    throw new AppError('NOT_FOUND', 'household not found');
  }

  // Reads the profile before the writes below.
  const profile = await ensureUserDoc(ctx.tx, ctx.uid);

  ctx.tx.set(memberRef, {
    uid: ctx.uid,
    role: 'caretaker',
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    joinedAt: FieldValue.serverTimestamp(),
    invitedBy: invite.createdBy,
    status: 'active',
  });
  const usedCount = invite.usedCount + 1;
  ctx.tx.set(
    inviteRef,
    {
      usedCount,
      status: usedCount >= invite.maxUses ? 'used' : 'active',
      acceptedBy: FieldValue.arrayUnion(ctx.uid),
      usedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  ctx.tx.set(
    db.collection('users').doc(ctx.uid),
    {
      householdIds: FieldValue.arrayUnion(invite.householdId),
      // An existing member of another household keeps their chosen default.
      ...(profile.defaultHouseholdId ? {} : { defaultHouseholdId: invite.householdId }),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  ctx.tx.set(
    householdRef,
    { memberCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  writeAudit(ctx.tx, {
    householdId: invite.householdId,
    actorUid: ctx.uid,
    actorType: 'user',
    action: 'member.accept',
    targetType: 'member',
    targetId: ctx.uid,
    after: { role: 'caretaker' },
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });

  return success(ctx, { householdId: invite.householdId });
}
