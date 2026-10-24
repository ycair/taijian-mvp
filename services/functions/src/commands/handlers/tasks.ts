import { Timestamp } from 'firebase-admin/firestore';
import { AppError, type CommandResult } from '@taijian/domain';
import { writeAudit } from '../../lib/audit';
import { db } from '../../lib/firestore';
import { completionId } from '../../lib/ids';
import { actorTypeFor, assertCan, requireHouseholdId, requireMember, success } from '../helpers';
import type { HandlerContext } from '../types';

type CompletionDoc = {
  householdId: string;
  reminderId: string;
  dueDate: string;
  completedAt?: unknown;
  completedBy?: string;
};

/** Stored completions carry a Firestore timestamp; responses use ISO strings. */
function isoOf(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : null;
}

/**
 * Idempotent completion. The document id is derived from the reminder and the
 * due date, so two devices completing the same occurrence converge on one
 * document no matter who arrives first: the second caller gets the stored
 * `completedBy` instead of overwriting it.
 */
export async function completeTask(ctx: HandlerContext): Promise<CommandResult> {
  const householdId = requireHouseholdId(ctx);
  const member = await requireMember(ctx.tx, householdId, ctx.uid);
  assertCan(member.role, 'reminder.manage');

  const payload = ctx.envelope.payload as { reminderId: string; dueDate: string };
  const reminderSnap = await ctx.tx.get(db.collection('reminders').doc(payload.reminderId));
  if (!reminderSnap.exists) throw new AppError('NOT_FOUND', 'reminder not found');
  const reminder = reminderSnap.data() as
    { householdId?: string; animalId?: string; deletedAt?: unknown } | undefined;
  if (reminder?.householdId !== householdId || reminder.deletedAt != null) {
    throw new AppError('NOT_FOUND', 'reminder not found');
  }

  const id = completionId(payload.reminderId, payload.dueDate);
  const ref = db.collection('taskCompletions').doc(id);
  const existing = await ctx.tx.get(ref);
  if (existing.exists) {
    // A repeated completion changes nothing, so it writes no audit entry.
    const data = existing.data() as CompletionDoc;
    return success(ctx, {
      completionId: id,
      alreadyCompleted: true,
      completedBy: data.completedBy ?? null,
      completedAt: isoOf(data.completedAt),
    });
  }

  ctx.tx.set(ref, {
    householdId,
    animalId: reminder.animalId ?? null,
    reminderId: payload.reminderId,
    dueDate: payload.dueDate,
    // `ctx.now` (not serverTimestamp) so a retry returns the exact stored time.
    completedAt: ctx.now,
    completedBy: ctx.uid,
    source: ctx.source,
  });
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: actorTypeFor(ctx),
    action: 'task.complete',
    targetType: 'reminder',
    targetId: payload.reminderId,
    after: { dueDate: payload.dueDate },
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });

  return success(ctx, {
    completionId: id,
    completedBy: ctx.uid,
    completedAt: ctx.now.toISOString(),
  });
}

/** Undo is limited to the member who completed the task or a household owner. */
export async function uncompleteTask(ctx: HandlerContext): Promise<CommandResult> {
  const householdId = requireHouseholdId(ctx);
  const member = await requireMember(ctx.tx, householdId, ctx.uid);
  assertCan(member.role, 'reminder.manage');

  const payload = ctx.envelope.payload as { reminderId: string; dueDate: string };
  const id = completionId(payload.reminderId, payload.dueDate);
  const ref = db.collection('taskCompletions').doc(id);
  const snap = await ctx.tx.get(ref);
  if (!snap.exists) throw new AppError('NOT_FOUND', 'completion not found');

  const data = snap.data() as CompletionDoc;
  // Another household's completion must stay invisible.
  if (data.householdId !== householdId) {
    throw new AppError('NOT_FOUND', 'completion not found');
  }
  if (member.role !== 'owner' && data.completedBy !== ctx.uid) {
    throw new AppError('FORBIDDEN', 'only the completer or an owner can undo');
  }

  ctx.tx.delete(ref);
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: actorTypeFor(ctx),
    action: 'task.uncomplete',
    targetType: 'reminder',
    targetId: payload.reminderId,
    before: { dueDate: payload.dueDate, completedBy: data.completedBy ?? null },
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });

  return success(ctx, { completionId: id, removed: true });
}
