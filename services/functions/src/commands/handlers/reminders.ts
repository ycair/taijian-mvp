import { FieldValue } from 'firebase-admin/firestore';
import {
  AppError,
  type CommandResult,
  type CreateReminderPayload,
  type ScheduleSchema,
} from '@taijian/domain';
import type { z } from 'zod';
import { writeAudit } from '../../lib/audit';
import { db } from '../../lib/firestore';
import { computeNextDueAt } from '../../lib/schedule';
import {
  actorTypeFor,
  assertCan,
  assertRevision,
  bump,
  requireHouseholdId,
  requireMember,
  success,
} from '../helpers';
import type { HandlerContext } from '../types';

type Schedule = z.infer<typeof ScheduleSchema>;
type ReminderInput = z.infer<typeof CreateReminderPayload>;

type ReminderDoc = {
  id: string;
  householdId: string;
  animalId: string;
  schedule: Schedule;
  timezone: string;
  enabled: boolean;
  revision: number;
  lastChangedFields?: string[];
  deletedAt?: unknown;
  [key: string]: unknown;
};

/**
 * Loads a reminder that belongs to `householdId`. Another household's reminder
 * and a soft-deleted reminder both report `NOT_FOUND`, matching records/animals.
 */
async function getReminder(
  ctx: HandlerContext,
  householdId: string,
  reminderId: string,
): Promise<{ ref: FirebaseFirestore.DocumentReference; data: ReminderDoc }> {
  const ref = db.collection('reminders').doc(reminderId);
  const snap = await ctx.tx.get(ref);
  if (!snap.exists) throw new AppError('NOT_FOUND', 'reminder not found');

  const data = { id: snap.id, ...snap.data() } as ReminderDoc;
  if (data.householdId !== householdId || data.deletedAt != null) {
    throw new AppError('NOT_FOUND', 'reminder not found');
  }
  return { ref, data };
}

/** A reminder may only point at a live animal of the same household. */
async function assertAnimalInHousehold(
  ctx: HandlerContext,
  householdId: string,
  animalId: string,
): Promise<void> {
  const snap = await ctx.tx.get(db.collection('animals').doc(animalId));
  if (!snap.exists) throw new AppError('NOT_FOUND', 'animal not found in household');
  const animal = snap.data() as { householdId?: string; deletedAt?: unknown } | undefined;
  if (animal?.householdId !== householdId || animal.deletedAt != null) {
    throw new AppError('NOT_FOUND', 'animal not found in household');
  }
}

export async function createReminder(ctx: HandlerContext): Promise<CommandResult> {
  const householdId = requireHouseholdId(ctx);
  const member = await requireMember(ctx.tx, householdId, ctx.uid);
  assertCan(member.role, 'reminder.manage');

  // Payload is already validated and defaulted by `runCommand`.
  const payload = ctx.envelope.payload as ReminderInput;
  await assertAnimalInHousehold(ctx, householdId, payload.animalId);

  const ref = db.collection('reminders').doc();
  const nextDueAt = computeNextDueAt(payload.schedule, payload.timezone, ctx.now);
  ctx.tx.set(ref, {
    ...payload,
    householdId,
    nextDueAt,
    lastCompletedAt: null,
    revision: 0,
    schemaVersion: 1,
    createdBy: ctx.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedBy: ctx.uid,
    updatedAt: FieldValue.serverTimestamp(),
    updatedFrom: ctx.source,
    deletedAt: null,
    lastChangedFields: [],
  });
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: actorTypeFor(ctx),
    action: 'reminder.create',
    targetType: 'reminder',
    targetId: ref.id,
    after: payload,
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });

  return success(ctx, { reminderId: ref.id, nextDueAt: nextDueAt.toISOString() }, 0);
}

export async function updateReminder(ctx: HandlerContext): Promise<CommandResult> {
  const householdId = requireHouseholdId(ctx);
  const member = await requireMember(ctx.tx, householdId, ctx.uid);
  assertCan(member.role, 'reminder.manage');

  const payload = ctx.envelope.payload as { reminderId: string } & Record<string, unknown>;
  const { ref, data } = await getReminder(ctx, householdId, payload.reminderId);
  assertRevision(data, ctx.envelope.baseRevision);

  const { reminderId, ...rest } = payload;
  const patch: Record<string, unknown> = { ...rest };
  // Derived and lifecycle fields are never client input.
  delete patch.nextDueAt;
  delete patch.deletedAt;
  delete patch.householdId;

  // Clients often send the whole form, including values that did not change.
  // `bump` derives `lastChangedFields` from the patch keys, and the Flutter
  // Today view treats an `enabled` change as a re-enable boundary. Keeping an
  // unchanged `enabled` would hide that day's earlier occurrence, so drop it.
  if (patch.enabled !== undefined && patch.enabled === data.enabled) {
    delete patch.enabled;
  }
  // Record the real transition explicitly; `lastChangedFields` alone is not a
  // reliable signal after an unrelated edit in the same request.
  if (patch.enabled !== undefined) {
    patch.enabledChangedAt = ctx.now;
  }

  if (patch.animalId !== undefined) {
    await assertAnimalInHousehold(ctx, householdId, patch.animalId as string);
  }

  // A new schedule, a new timezone, or re-enabling a paused reminder all
  // invalidate the stored `nextDueAt`.
  const rescheduled =
    patch.schedule !== undefined ||
    patch.timezone !== undefined ||
    (patch.enabled === true && data.enabled === false);
  if (rescheduled) {
    patch.nextDueAt = computeNextDueAt(
      (patch.schedule ?? data.schedule) as Schedule,
      (patch.timezone ?? data.timezone) as string,
      ctx.now,
    );
  }

  ctx.tx.set(ref, bump(data, patch, ctx), { merge: true });
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: actorTypeFor(ctx),
    action: 'reminder.update',
    targetType: 'reminder',
    targetId: reminderId,
    before: data,
    after: patch,
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });

  return success(ctx, { reminderId }, data.revision + 1);
}

export async function deleteReminder(ctx: HandlerContext): Promise<CommandResult> {
  const householdId = requireHouseholdId(ctx);
  const member = await requireMember(ctx.tx, householdId, ctx.uid);
  assertCan(member.role, 'reminder.manage');

  const payload = ctx.envelope.payload as { reminderId: string };
  const { ref, data } = await getReminder(ctx, householdId, payload.reminderId);
  assertRevision(data, ctx.envelope.baseRevision);

  ctx.tx.set(ref, bump(data, { deletedAt: FieldValue.serverTimestamp(), enabled: false }, ctx), {
    merge: true,
  });
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: actorTypeFor(ctx),
    action: 'reminder.delete',
    targetType: 'reminder',
    targetId: payload.reminderId,
    before: data,
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });

  return success(ctx, { reminderId: payload.reminderId, deleted: true }, data.revision + 1);
}
