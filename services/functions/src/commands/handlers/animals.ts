import { FieldValue } from 'firebase-admin/firestore';
import { AppError, type CommandResult } from '@taijian/domain';
import { writeAudit } from '../../lib/audit';
import { db } from '../../lib/firestore';
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

type AnimalDoc = {
  id: string;
  householdId: string;
  revision: number;
  lastChangedFields?: string[];
  deletedAt?: unknown;
  [key: string]: unknown;
};

/**
 * Soft-deleting an animal also hides its records and reminders. A household with
 * a long history can hold more children than one transaction may safely write, so
 * the cascade stops at these bounds and flags `cleanupPending` for a purge job.
 * The animal itself is always marked deleted, so nothing stale stays visible.
 */
export const CASCADE_RECORD_LIMIT = 200;
export const CASCADE_REMINDER_LIMIT = 50;

/**
 * Loads an animal that belongs to `householdId`. A soft-deleted animal and an
 * animal from another household both look `NOT_FOUND` so a member cannot probe
 * for ids outside their household.
 */
async function getAnimal(
  ctx: HandlerContext,
  householdId: string,
  animalId: string,
): Promise<{ ref: FirebaseFirestore.DocumentReference; data: AnimalDoc }> {
  const ref = db.collection('animals').doc(animalId);
  const snap = await ctx.tx.get(ref);
  if (!snap.exists) throw new AppError('NOT_FOUND', 'animal not found');

  const data = { id: snap.id, ...snap.data() } as AnimalDoc;
  if (data.householdId !== householdId || data.deletedAt != null) {
    throw new AppError('NOT_FOUND', 'animal not found');
  }
  return { ref, data };
}

export async function createAnimal(ctx: HandlerContext): Promise<CommandResult> {
  const householdId = requireHouseholdId(ctx);
  const member = await requireMember(ctx.tx, householdId, ctx.uid);
  assertCan(member.role, 'animal.create');

  // Payload is already validated and defaulted by `runCommand`.
  const payload = ctx.envelope.payload as Record<string, unknown>;
  const ref = db.collection('animals').doc();
  ctx.tx.set(ref, {
    ...payload,
    householdId,
    status: 'active',
    revision: 0,
    schemaVersion: 1,
    createdBy: ctx.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedBy: ctx.uid,
    updatedAt: FieldValue.serverTimestamp(),
    updatedFrom: ctx.source,
    deletedAt: null,
    cleanupPending: false,
    lastChangedFields: [],
  });
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: actorTypeFor(ctx),
    action: 'animal.create',
    targetType: 'animal',
    targetId: ref.id,
    after: payload,
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });

  return success(ctx, { animalId: ref.id }, 0);
}

export async function updateAnimal(ctx: HandlerContext): Promise<CommandResult> {
  const householdId = requireHouseholdId(ctx);
  const member = await requireMember(ctx.tx, householdId, ctx.uid);
  assertCan(member.role, 'animal.update');

  const payload = ctx.envelope.payload as { animalId: string } & Record<string, unknown>;
  const { ref, data } = await getAnimal(ctx, householdId, payload.animalId);
  assertRevision(data, ctx.envelope.baseRevision);

  const { animalId, ...rest } = payload;
  // Lifecycle changes are owner-only commands (`animal.archive`, `animal.delete`).
  // `status` is not part of UpdateAnimalPayload; dropping it here keeps that rule
  // true even if the schema is loosened later.
  const patch = { ...rest };
  delete patch.status;
  delete patch.deletedAt;

  ctx.tx.set(ref, bump(data, patch, ctx), { merge: true });
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: actorTypeFor(ctx),
    action: 'animal.update',
    targetType: 'animal',
    targetId: animalId,
    before: data,
    after: patch,
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });

  return success(ctx, { animalId }, data.revision + 1);
}

export async function archiveAnimal(ctx: HandlerContext): Promise<CommandResult> {
  const householdId = requireHouseholdId(ctx);
  const member = await requireMember(ctx.tx, householdId, ctx.uid);
  assertCan(member.role, 'animal.archive');

  const payload = ctx.envelope.payload as { animalId: string };
  const { ref, data } = await getAnimal(ctx, householdId, payload.animalId);
  assertRevision(data, ctx.envelope.baseRevision);

  ctx.tx.set(ref, bump(data, { status: 'archived' }, ctx), { merge: true });
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: actorTypeFor(ctx),
    action: 'animal.archive',
    targetType: 'animal',
    targetId: payload.animalId,
    before: data,
    after: { status: 'archived' },
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });

  return success(ctx, { animalId: payload.animalId, status: 'archived' }, data.revision + 1);
}

export async function deleteAnimal(ctx: HandlerContext): Promise<CommandResult> {
  const householdId = requireHouseholdId(ctx);
  const member = await requireMember(ctx.tx, householdId, ctx.uid);
  assertCan(member.role, 'animal.delete');

  const payload = ctx.envelope.payload as { animalId: string };
  const { ref, data } = await getAnimal(ctx, householdId, payload.animalId);
  assertRevision(data, ctx.envelope.baseRevision);

  // All reads must finish before the first cascade write below.
  const cascade = await cascadeAnimalChildren(ctx, householdId, payload.animalId);

  ctx.tx.set(
    ref,
    {
      deletedAt: FieldValue.serverTimestamp(),
      status: 'archived',
      cleanupPending: cascade.cleanupPending,
      revision: data.revision + 1,
      lastChangedFields: ['deletedAt', 'status'],
      updatedBy: ctx.uid,
      updatedAt: FieldValue.serverTimestamp(),
      updatedFrom: ctx.source,
    },
    { merge: true },
  );
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: actorTypeFor(ctx),
    action: 'animal.delete',
    targetType: 'animal',
    targetId: payload.animalId,
    before: data,
    after: {
      deleted: true,
      cascadedRecords: cascade.records,
      cascadedReminders: cascade.reminders,
      cleanupPending: cascade.cleanupPending,
    },
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });

  return success(
    ctx,
    {
      animalId: payload.animalId,
      deleted: true,
      cleanupPending: cascade.cleanupPending,
      cascadedRecords: cascade.records,
      cascadedReminders: cascade.reminders,
    },
    data.revision + 1,
  );
}

type CascadeResult = {
  records: number;
  reminders: number;
  cleanupPending: boolean;
};

/**
 * Soft-deletes the animal's records and reminders within transaction bounds.
 * When the bounded query overflows, the remaining documents keep their old
 * `deletedAt` and `cleanupPending` tells the purge job to finish the job, so a
 * large history can never fail the delete command.
 */
async function cascadeAnimalChildren(
  ctx: HandlerContext,
  householdId: string,
  animalId: string,
): Promise<CascadeResult> {
  const recordSnap = await ctx.tx.get(
    db
      .collection('records')
      .where('animalId', '==', animalId)
      .limit(CASCADE_RECORD_LIMIT + 1),
  );
  const reminderSnap = await ctx.tx.get(
    db
      .collection('reminders')
      .where('animalId', '==', animalId)
      .limit(CASCADE_REMINDER_LIMIT + 1),
  );

  const live = (doc: FirebaseFirestore.QueryDocumentSnapshot) =>
    doc.data().deletedAt == null && doc.data().householdId === householdId;
  const records = recordSnap.docs.filter(live).slice(0, CASCADE_RECORD_LIMIT);
  const reminders = reminderSnap.docs.filter(live).slice(0, CASCADE_REMINDER_LIMIT);

  for (const doc of [...records, ...reminders]) {
    ctx.tx.set(
      doc.ref,
      {
        deletedAt: FieldValue.serverTimestamp(),
        deletedWithAnimal: animalId,
        revision: ((doc.data().revision as number | undefined) ?? 0) + 1,
        lastChangedFields: ['deletedAt'],
        updatedBy: ctx.uid,
        updatedAt: FieldValue.serverTimestamp(),
        updatedFrom: ctx.source,
      },
      { merge: true },
    );
  }

  return {
    records: records.length,
    reminders: reminders.length,
    cleanupPending:
      recordSnap.docs.length > CASCADE_RECORD_LIMIT ||
      reminderSnap.docs.length > CASCADE_REMINDER_LIMIT,
  };
}
