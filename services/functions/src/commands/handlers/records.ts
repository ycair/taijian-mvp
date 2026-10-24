import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { AppError, type CommandResult } from '@taijian/domain';
import { writeAudit } from '../../lib/audit';
import { db } from '../../lib/firestore';
import { requestHash } from '../../lib/ids';
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

type RecordDoc = {
  id: string;
  householdId: string;
  createdBy: string;
  revision: number;
  payloadHash?: string;
  lastChangedFields?: string[];
  deletedAt?: unknown;
  [key: string]: unknown;
};

/**
 * Loads a record that belongs to `householdId`. Records of another household and
 * soft-deleted records both report `NOT_FOUND`.
 */
async function getRecord(
  ctx: HandlerContext,
  householdId: string,
  recordId: string,
): Promise<{ ref: FirebaseFirestore.DocumentReference; data: RecordDoc }> {
  const ref = db.collection('records').doc(recordId);
  const snap = await ctx.tx.get(ref);
  if (!snap.exists) throw new AppError('NOT_FOUND', 'record not found');

  const data = { id: snap.id, ...snap.data() } as RecordDoc;
  if (data.householdId !== householdId || data.deletedAt != null) {
    throw new AppError('NOT_FOUND', 'record not found');
  }
  return { ref, data };
}

export async function createRecord(ctx: HandlerContext): Promise<CommandResult> {
  const householdId = requireHouseholdId(ctx);
  const member = await requireMember(ctx.tx, householdId, ctx.uid);
  assertCan(member.role, 'record.create');

  const payload = ctx.envelope.payload as { animalId: string } & Record<string, unknown>;
  const animalSnap = await ctx.tx.get(db.collection('animals').doc(payload.animalId));
  if (!animalSnap.exists) throw new AppError('NOT_FOUND', 'animal not found in household');
  const animal = animalSnap.data() as { householdId?: string; deletedAt?: unknown } | undefined;
  if (animal?.householdId !== householdId || animal.deletedAt != null) {
    throw new AppError('NOT_FOUND', 'animal not found in household');
  }

  // A client may pick the id so an offline retry maps to the same record. The
  // payload hash proves a reused id carries the same write; anything else is a
  // bug (or a collision) and must not overwrite the original record.
  const recordId = (payload.recordId as string | undefined) ?? randomUUID();
  const payloadHash = requestHash('record.create', payload);
  const ref = db.collection('records').doc(recordId);
  const existing = await ctx.tx.get(ref);
  if (existing.exists) {
    const data = existing.data() as RecordDoc;
    if (data.createdBy !== ctx.uid || data.payloadHash !== payloadHash) {
      throw new AppError('DUPLICATE_ID', 'record id already used');
    }
    writeAudit(ctx.tx, {
      householdId,
      actorUid: ctx.uid,
      actorType: actorTypeFor(ctx),
      action: 'record.create',
      targetType: 'record',
      targetId: recordId,
      after: { recordId, alreadyExists: true },
      commandId: ctx.envelope.commandId,
      source: ctx.source,
    });
    return success(ctx, { recordId, alreadyExists: true }, data.revision);
  }

  ctx.tx.set(ref, {
    ...payload,
    recordId,
    payloadHash,
    householdId,
    source: ctx.source,
    sourceEventId: null,
    revision: 0,
    createdBy: ctx.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedBy: ctx.uid,
    updatedAt: FieldValue.serverTimestamp(),
    deletedAt: null,
    lastChangedFields: [],
  });
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: actorTypeFor(ctx),
    action: 'record.create',
    targetType: 'record',
    targetId: recordId,
    after: payload,
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });

  return success(ctx, { recordId }, 0);
}

export async function updateRecord(ctx: HandlerContext): Promise<CommandResult> {
  const householdId = requireHouseholdId(ctx);
  const member = await requireMember(ctx.tx, householdId, ctx.uid);
  assertCan(member.role, 'record.update');

  const payload = ctx.envelope.payload as { recordId: string } & Record<string, unknown>;
  const { ref, data } = await getRecord(ctx, householdId, payload.recordId);
  if (member.role !== 'owner' && data.createdBy !== ctx.uid) {
    throw new AppError('FORBIDDEN', 'caretakers can only edit their own records');
  }
  assertRevision(data, ctx.envelope.baseRevision);

  const { recordId, ...rest } = payload;
  const patch = { ...rest };
  // A record never moves between animals; ownership and provenance are immutable.
  delete patch.animalId;
  delete patch.createdBy;
  delete patch.payloadHash;

  ctx.tx.set(ref, bump(data, patch, ctx), { merge: true });
  writeAudit(ctx.tx, {
    householdId,
    actorUid: ctx.uid,
    actorType: actorTypeFor(ctx),
    action: 'record.update',
    targetType: 'record',
    targetId: recordId,
    before: data,
    after: patch,
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });

  return success(ctx, { recordId }, data.revision + 1);
}

export async function deleteRecord(ctx: HandlerContext): Promise<CommandResult> {
  const householdId = requireHouseholdId(ctx);
  const member = await requireMember(ctx.tx, householdId, ctx.uid);
  assertCan(member.role, 'record.delete');

  const payload = ctx.envelope.payload as { recordId: string };
  const { ref, data } = await getRecord(ctx, householdId, payload.recordId);
  if (member.role !== 'owner' && data.createdBy !== ctx.uid) {
    throw new AppError('FORBIDDEN', 'caretakers can only delete their own records');
  }
  assertRevision(data, ctx.envelope.baseRevision);

  ctx.tx.set(
    ref,
    {
      deletedAt: FieldValue.serverTimestamp(),
      revision: data.revision + 1,
      lastChangedFields: ['deletedAt'],
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
    action: 'record.delete',
    targetType: 'record',
    targetId: payload.recordId,
    before: data,
    commandId: ctx.envelope.commandId,
    source: ctx.source,
  });

  return success(ctx, { recordId: payload.recordId, deleted: true }, data.revision + 1);
}
