import { AppError, type CommandResult } from '@taijian/domain';
import { FieldValue } from 'firebase-admin/firestore';
import { writeAudit } from '../../lib/audit';
import { db } from '../../lib/firestore';
import {
  actorTypeFor,
  assertCan,
  assertRevision,
  bump,
  counterPatch,
  detachHouseholdFromUser,
  ensureUserDoc,
  mustGetHousehold,
  requireHouseholdId,
  requireMember,
  success,
} from '../helpers';
import type { HandlerContext } from '../types';

export async function createHousehold(ctx: HandlerContext): Promise<CommandResult> {
  const payload = ctx.envelope.payload as { name: string; timezone: string };
  const householdRef = db.collection('households').doc();
  const householdId = householdRef.id;

  // Read before writing: the profile document must exist before the household
  // reference and the owner membership point at this UID.
  const profile = await ensureUserDoc(ctx.tx, ctx.uid);

  ctx.tx.set(householdRef, {
    name: payload.name,
    ownerUid: ctx.uid,
    ownerCount: 1,
    memberCount: 1,
    timezone: payload.timezone,
    settings: { notificationsEnabled: true },
    revision: 0,
    schemaVersion: 1,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    deletedAt: null,
  });
  ctx.tx.set(db.doc(`households/${householdId}/members/${ctx.uid}`), {
    uid: ctx.uid,
    role: 'owner',
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    joinedAt: FieldValue.serverTimestamp(),
    invitedBy: null,
    status: 'active',
  });
  ctx.tx.set(
    db.collection('users').doc(ctx.uid),
    {
      householdIds: FieldValue.arrayUnion(householdId),
      defaultHouseholdId: householdId,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: actorTypeFor(ctx),
    action: 'household.create',
    targetType: 'household',
    targetId: householdId,
    after: { name: payload.name, timezone: payload.timezone },
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });

  return success(ctx, { householdId }, 0);
}

export async function updateHousehold(ctx: HandlerContext): Promise<CommandResult> {
  const householdId = requireHouseholdId(ctx);
  const member = await requireMember(ctx.tx, householdId, ctx.uid);
  assertCan(member.role, 'household.update');

  const household = await mustGetHousehold(ctx.tx, householdId);
  assertRevision(household, ctx.envelope.baseRevision);

  const payload = ctx.envelope.payload as Record<string, unknown>;
  const patch = bump(household, payload, ctx);
  ctx.tx.set(db.collection('households').doc(householdId), patch, { merge: true });
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: actorTypeFor(ctx),
    action: 'household.update',
    targetType: 'household',
    targetId: householdId,
    before: household,
    after: payload,
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });

  return success(ctx, { householdId }, household.revision + 1);
}

export async function deleteHousehold(ctx: HandlerContext): Promise<CommandResult> {
  const householdId = requireHouseholdId(ctx);
  const member = await requireMember(ctx.tx, householdId, ctx.uid);
  assertCan(member.role, 'household.delete');

  const household = await mustGetHousehold(ctx.tx, householdId);
  if (household.memberCount !== 1) {
    throw new AppError('FORBIDDEN', 'remove other members or transfer ownership first');
  }

  // Reads first: active invites and the profile, before any write below.
  const invitesSnap = await ctx.tx.get(
    db.collection('invites').where('householdId', '==', householdId),
  );
  const activeInvites = invitesSnap.docs.filter((doc) => doc.data().status === 'active');
  await detachHouseholdFromUser(ctx.tx, ctx.uid, householdId);

  for (const invite of activeInvites) {
    ctx.tx.set(
      invite.ref,
      {
        status: 'revoked',
        revokedAt: FieldValue.serverTimestamp(),
        revokedBy: ctx.uid,
      },
      { merge: true },
    );
  }
  ctx.tx.set(
    db.collection('households').doc(householdId),
    counterPatch(ctx, {
      memberCount: 0,
      ownerCount: 0,
      deletedAt: FieldValue.serverTimestamp(),
    }),
    { merge: true },
  );
  ctx.tx.delete(db.doc(`households/${householdId}/members/${ctx.uid}`));
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: actorTypeFor(ctx),
    action: 'household.delete',
    targetType: 'household',
    targetId: householdId,
    before: household,
    after: { deleted: true, revokedInvites: activeInvites.length },
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });

  return success(ctx, {
    householdId,
    deleted: true,
    revokedInvites: activeInvites.length,
  });
}
