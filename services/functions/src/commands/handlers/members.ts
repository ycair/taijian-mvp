import { AppError, type CommandResult, type Role } from '@taijian/domain';
import { FieldValue } from 'firebase-admin/firestore';
import { writeAudit } from '../../lib/audit';
import { db } from '../../lib/firestore';
import {
  actorTypeFor,
  assertCan,
  counterPatch,
  detachHouseholdFromUser,
  mustGetHousehold,
  nextOwnerUid,
  requireHouseholdId,
  requireMember,
  success,
} from '../helpers';
import type { HandlerContext } from '../types';

type MemberDoc = { role: Role };

export async function updateMemberRole(ctx: HandlerContext): Promise<CommandResult> {
  const householdId = requireHouseholdId(ctx);
  const actor = await requireMember(ctx.tx, householdId, ctx.uid);
  assertCan(actor.role, 'member.updateRole');

  const household = await mustGetHousehold(ctx.tx, householdId);
  const payload = ctx.envelope.payload as { uid: string; role: Role };
  if (payload.uid === ctx.uid) throw new AppError('FORBIDDEN', 'cannot change your own role');

  const targetRef = db.doc(`households/${householdId}/members/${payload.uid}`);
  const targetSnap = await ctx.tx.get(targetRef);
  if (!targetSnap.exists) throw new AppError('NOT_FOUND', 'member not found');
  const target = targetSnap.data() as MemberDoc;

  if (target.role === payload.role) {
    // No-op: audit the attempt but never move the owner/member counters.
    writeAudit(ctx.tx, {
      householdId,
      actorUid: ctx.uid,
      actorType: actorTypeFor(ctx),
      action: 'member.updateRole',
      targetType: 'member',
      targetId: payload.uid,
      before: { role: target.role },
      after: { role: payload.role },
      commandId: ctx.envelope.commandId,
      source: ctx.source,
    });
    return success(ctx, { uid: payload.uid, role: payload.role });
  }
  if (target.role === 'owner' && household.ownerCount <= 1) {
    throw new AppError('LAST_OWNER', 'cannot demote the last owner');
  }

  // Reads before the writes below: a demoted `ownerUid` hands over to another owner.
  const newOwnerUid =
    target.role === 'owner'
      ? await nextOwnerUid(ctx.tx, householdId, household, payload.uid)
      : undefined;

  ctx.tx.set(targetRef, { role: payload.role }, { merge: true });
  ctx.tx.set(
    db.collection('households').doc(householdId),
    counterPatch(ctx, {
      ownerCount: FieldValue.increment(payload.role === 'owner' ? 1 : -1),
      ...(newOwnerUid ? { ownerUid: newOwnerUid } : {}),
    }),
    { merge: true },
  );
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: actorTypeFor(ctx),
    action: 'member.updateRole',
    targetType: 'member',
    targetId: payload.uid,
    before: { role: target.role },
    after: { role: payload.role },
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });

  return success(ctx, { uid: payload.uid, role: payload.role });
}

export async function removeMember(ctx: HandlerContext): Promise<CommandResult> {
  const householdId = requireHouseholdId(ctx);
  const actor = await requireMember(ctx.tx, householdId, ctx.uid);
  assertCan(actor.role, 'member.remove');

  const household = await mustGetHousehold(ctx.tx, householdId);
  const payload = ctx.envelope.payload as { uid: string };
  // Leaving is a self-service action with its own last-owner rules.
  if (payload.uid === ctx.uid) {
    throw new AppError('FORBIDDEN', 'use member.leave to leave the household');
  }

  const targetRef = db.doc(`households/${householdId}/members/${payload.uid}`);
  const targetSnap = await ctx.tx.get(targetRef);
  if (!targetSnap.exists) throw new AppError('NOT_FOUND', 'member not found');
  const target = targetSnap.data() as MemberDoc;

  if (target.role === 'owner' && household.ownerCount <= 1) {
    throw new AppError('LAST_OWNER', 'cannot remove the last owner');
  }

  // Reads before the writes below: a removed `ownerUid` hands over to another owner.
  const newOwnerUid =
    target.role === 'owner'
      ? await nextOwnerUid(ctx.tx, householdId, household, payload.uid)
      : undefined;
  await detachHouseholdFromUser(ctx.tx, payload.uid, householdId);

  ctx.tx.delete(targetRef);
  ctx.tx.set(
    db.collection('households').doc(householdId),
    counterPatch(ctx, {
      memberCount: FieldValue.increment(-1),
      ownerCount: FieldValue.increment(target.role === 'owner' ? -1 : 0),
      ...(newOwnerUid ? { ownerUid: newOwnerUid } : {}),
    }),
    { merge: true },
  );
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: actorTypeFor(ctx),
    action: 'member.remove',
    targetType: 'member',
    targetId: payload.uid,
    before: { role: target.role },
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });

  return success(ctx, { uid: payload.uid, removed: true });
}

export async function leaveHousehold(ctx: HandlerContext): Promise<CommandResult> {
  const householdId = requireHouseholdId(ctx);
  const member = await requireMember(ctx.tx, householdId, ctx.uid);
  const household = await mustGetHousehold(ctx.tx, householdId);

  if (member.role === 'owner' && household.ownerCount <= 1) {
    throw new AppError('LAST_OWNER', 'transfer ownership before leaving');
  }

  // Reads before the writes below: a leaving `ownerUid` hands over to another owner.
  const newOwnerUid =
    member.role === 'owner'
      ? await nextOwnerUid(ctx.tx, householdId, household, ctx.uid)
      : undefined;
  await detachHouseholdFromUser(ctx.tx, ctx.uid, householdId);

  ctx.tx.delete(db.doc(`households/${householdId}/members/${ctx.uid}`));
  ctx.tx.set(
    db.collection('households').doc(householdId),
    counterPatch(ctx, {
      memberCount: FieldValue.increment(-1),
      ownerCount: FieldValue.increment(member.role === 'owner' ? -1 : 0),
      ...(newOwnerUid ? { ownerUid: newOwnerUid } : {}),
    }),
    { merge: true },
  );
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: actorTypeFor(ctx),
    action: 'member.leave',
    targetType: 'member',
    targetId: ctx.uid,
    before: { role: member.role },
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });

  return success(ctx, { householdId, left: true });
}
