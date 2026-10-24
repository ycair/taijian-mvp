import { beforeEach, describe, expect, it } from 'vitest';
import { newCommandId, type CommandResult, type CommandSuccess } from '@taijian/domain';
import { runCommand } from '../../src/commands/runCommand';
import { commandHandlers } from '../../src/commands/registry';
import { requestHash } from '../../src/lib/ids';
import type { Source } from '../../src/commands/types';
import { adminDb, clearFirestore, envelope, seedUser } from './helpers';

const OWNER = 'u1';
const CARETAKER = 'u2';

const ANIMAL = {
  name: '阿肥',
  species: 'leopard-gecko',
  sex: 'unknown' as const,
  avatarColor: '#7C9A76',
};

type SendOptions = {
  householdId?: string;
  baseRevision?: number;
  commandId?: string;
  source?: Source;
};

function send(
  uid: string,
  type: string,
  payload: unknown,
  options: SendOptions = {},
): Promise<CommandResult> {
  const { source = 'test', ...rest } = options;
  return runCommand({
    uid,
    envelope: envelope(type, payload, rest),
    source,
    handlers: commandHandlers,
  });
}

function success<T>(result: CommandResult<T>, label: string): CommandSuccess<T> {
  if (!result.ok) throw new Error(`${label} failed: ${result.message}`);
  return result;
}

async function createHousehold(uid = OWNER): Promise<string> {
  const result = success(
    await send(uid, 'household.create', { name: '家', timezone: 'Asia/Taipei' }),
    'household.create',
  );
  return (result.data as { householdId: string }).householdId;
}

async function addCaretaker(householdId: string, uid = CARETAKER): Promise<void> {
  const invite = success(
    await send(OWNER, 'member.invite', { role: 'caretaker', expiresInDays: 7 }, { householdId }),
    'member.invite',
  );
  success(
    await send(uid, 'member.accept', { token: (invite.data as { token: string }).token }),
    'member.accept',
  );
}

async function createAnimal(householdId: string, uid = OWNER): Promise<string> {
  const result = success(
    await send(uid, 'animal.create', ANIMAL, { householdId }),
    'animal.create',
  );
  return (result.data as { animalId: string }).animalId;
}

async function setupAnimal(): Promise<{ householdId: string; animalId: string }> {
  const householdId = await createHousehold();
  const animalId = await createAnimal(householdId);
  return { householdId, animalId };
}

async function recordDoc(recordId: string): Promise<Record<string, any> | undefined> {
  return (await adminDb.collection('records').doc(recordId).get()).data();
}

async function recordsFor(householdId: string): Promise<Array<Record<string, any>>> {
  const snap = await adminDb.collection('records').where('householdId', '==', householdId).get();
  return snap.docs.map((doc) => doc.data());
}

async function auditActions(householdId: string): Promise<string[]> {
  const snap = await adminDb.collection(`households/${householdId}/auditLogs`).get();
  return snap.docs.map((doc) => doc.data().action as string);
}

beforeEach(async () => {
  await clearFirestore();
  await seedUser(OWNER);
  await seedUser(CARETAKER);
});

describe('record commands', () => {
  it('keeps two concurrent records and dedupes the same command', async () => {
    const { householdId, animalId } = await setupAnimal();
    const commandId = newCommandId();
    // A retry resends the same payload; a different `occurredAt` would be a
    // different command and must not be silently replayed.
    const occurredAt = new Date().toISOString();
    const payload = { animalId, type: 'weight', occurredAt, value: 68, unit: 'g' };

    const first = await send(OWNER, 'record.create', payload, { householdId, commandId });
    const replay = await send(OWNER, 'record.create', payload, { householdId, commandId });

    expect(first.ok).toBe(true);
    expect(replay.ok).toBe(true);
    if (!first.ok || !replay.ok) return;
    expect(replay.data).toEqual(first.data);

    const records = await recordsFor(householdId);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      animalId,
      type: 'weight',
      value: 68,
      unit: 'g',
      householdId,
      source: 'test',
      sourceEventId: null,
      revision: 0,
      createdBy: OWNER,
      deletedAt: null,
      lastChangedFields: [],
    });
    // The stored hash is what makes a reused record id detectable.
    expect(records[0]?.payloadHash).toBe(requestHash('record.create', payload));
    expect(await auditActions(householdId)).toContain('record.create');
  });

  it('stores two records created back to back', async () => {
    const { householdId, animalId } = await setupAnimal();
    const occurredAt = new Date().toISOString();

    const first = success(
      await send(
        OWNER,
        'record.create',
        { animalId, type: 'weight', occurredAt, value: 68, unit: 'g' },
        { householdId },
      ),
      'first record.create',
    );
    const second = success(
      await send(
        OWNER,
        'record.create',
        { animalId, type: 'weight', occurredAt, value: 70, unit: 'g' },
        { householdId },
      ),
      'second record.create',
    );

    expect((first.data as { recordId: string }).recordId).not.toBe(
      (second.data as { recordId: string }).recordId,
    );
    expect(await recordsFor(householdId)).toHaveLength(2);
  });

  it('rejects the same record id with a different payload', async () => {
    const { householdId, animalId } = await setupAnimal();
    const occurredAt = new Date().toISOString();
    const recordId = newCommandId();

    success(
      await send(
        OWNER,
        'record.create',
        { recordId, animalId, type: 'weight', occurredAt, value: 68, unit: 'g' },
        { householdId },
      ),
      'first record.create',
    );

    await expect(
      send(
        OWNER,
        'record.create',
        { recordId, animalId, type: 'weight', occurredAt, value: 99, unit: 'g' },
        { householdId },
      ),
    ).rejects.toMatchObject({ code: 'DUPLICATE_ID' });

    const records = await recordsFor(householdId);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ value: 68 });
  });

  it('treats the same record id and payload as an idempotent create', async () => {
    const { householdId, animalId } = await setupAnimal();
    const occurredAt = new Date().toISOString();
    const recordId = newCommandId();
    const payload = { recordId, animalId, type: 'feeding', occurredAt, note: '蟋蟀兩隻' };

    const first = success(
      await send(OWNER, 'record.create', payload, { householdId }),
      'first record.create',
    );
    const again = success(
      await send(OWNER, 'record.create', payload, { householdId }),
      'second record.create',
    );

    expect((again.data as { alreadyExists?: boolean }).alreadyExists).toBe(true);
    expect((again.data as { recordId: string }).recordId).toBe(
      (first.data as { recordId: string }).recordId,
    );
    expect(await recordsFor(householdId)).toHaveLength(1);
  });

  it('increments the revision on update and rejects a stale update', async () => {
    const { householdId, animalId } = await setupAnimal();
    const otherAnimalId = await createAnimal(householdId);
    const created = success(
      await send(
        OWNER,
        'record.create',
        { animalId, type: 'weight', occurredAt: new Date().toISOString(), value: 68, unit: 'g' },
        { householdId },
      ),
      'record.create',
    );
    const recordId = (created.data as { recordId: string }).recordId;

    const updated = await send(
      OWNER,
      'record.update',
      // `animalId` is not part of UpdateRecordPayload: a record never moves.
      { recordId, value: 70, animalId: otherAnimalId },
      { householdId, baseRevision: 0 },
    );
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.revision).toBe(1);
    expect(await recordDoc(recordId)).toMatchObject({
      animalId,
      value: 70,
      revision: 1,
      lastChangedFields: ['value'],
      updatedBy: OWNER,
    });

    await expect(
      send(OWNER, 'record.update', { recordId, value: 72 }, { householdId, baseRevision: 0 }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      details: {
        currentRevision: 1,
        lastChangedFields: ['value'],
        current: expect.objectContaining({ value: 70 }),
      },
    });
    expect(await recordDoc(recordId)).toMatchObject({ value: 70, revision: 1 });
  });

  it('lets a caretaker edit and delete only their own records', async () => {
    const { householdId, animalId } = await setupAnimal();
    await addCaretaker(householdId);
    const occurredAt = new Date().toISOString();

    const ownerRecord = success(
      await send(
        OWNER,
        'record.create',
        { animalId, type: 'note', occurredAt, note: '主人的紀錄' },
        { householdId },
      ),
      'owner record.create',
    );
    const caretakerRecord = success(
      await send(
        CARETAKER,
        'record.create',
        { animalId, type: 'note', occurredAt, note: '照護者的紀錄' },
        { householdId },
      ),
      'caretaker record.create',
    );
    const ownerRecordId = (ownerRecord.data as { recordId: string }).recordId;
    const caretakerRecordId = (caretakerRecord.data as { recordId: string }).recordId;

    await expect(
      send(
        CARETAKER,
        'record.update',
        { recordId: ownerRecordId, note: '偷改' },
        { householdId, baseRevision: 0 },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      send(
        CARETAKER,
        'record.delete',
        { recordId: ownerRecordId },
        { householdId, baseRevision: 0 },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    success(
      await send(
        CARETAKER,
        'record.update',
        { recordId: caretakerRecordId, note: '自己的' },
        { householdId, baseRevision: 0 },
      ),
      'caretaker record.update',
    );
    expect(await recordDoc(caretakerRecordId)).toMatchObject({ note: '自己的', revision: 1 });

    // The owner may edit and delete anyone's record.
    success(
      await send(
        OWNER,
        'record.update',
        { recordId: caretakerRecordId, note: '主人修正' },
        { householdId, baseRevision: 1 },
      ),
      'owner record.update',
    );
    expect(await recordDoc(caretakerRecordId)).toMatchObject({ note: '主人修正', revision: 2 });

    success(
      await send(
        OWNER,
        'record.delete',
        { recordId: caretakerRecordId },
        { householdId, baseRevision: 2 },
      ),
      'owner record.delete',
    );
    expect((await recordDoc(caretakerRecordId))?.deletedAt).not.toBeNull();

    // A caretaker can still delete a record they created themselves.
    const ownDeleted = success(
      await send(
        CARETAKER,
        'record.create',
        { animalId, type: 'note', occurredAt, note: '自己的第二筆' },
        { householdId },
      ),
      'caretaker second record.create',
    );
    success(
      await send(
        CARETAKER,
        'record.delete',
        { recordId: (ownDeleted.data as { recordId: string }).recordId },
        { householdId, baseRevision: 0 },
      ),
      'caretaker record.delete',
    );
    expect(
      (await recordDoc((ownDeleted.data as { recordId: string }).recordId))?.deletedAt,
    ).not.toBeNull();
  });

  it('soft deletes a record and refuses further commands on it', async () => {
    const { householdId, animalId } = await setupAnimal();
    const created = success(
      await send(
        OWNER,
        'record.create',
        { animalId, type: 'note', occurredAt: new Date().toISOString(), note: '要刪掉的' },
        { householdId },
      ),
      'record.create',
    );
    const recordId = (created.data as { recordId: string }).recordId;

    const deleted = await send(
      OWNER,
      'record.delete',
      { recordId },
      { householdId, baseRevision: 0 },
    );
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    expect(deleted.data).toMatchObject({ recordId, deleted: true });
    expect(deleted.revision).toBe(1);

    expect(await recordDoc(recordId)).toMatchObject({
      revision: 1,
      lastChangedFields: ['deletedAt'],
      updatedBy: OWNER,
    });
    expect((await recordDoc(recordId))?.deletedAt).not.toBeNull();

    await expect(
      send(OWNER, 'record.update', { recordId, note: '再改' }, { householdId, baseRevision: 1 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      send(OWNER, 'record.delete', { recordId }, { householdId, baseRevision: 1 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect(await auditActions(householdId)).toEqual(
      expect.arrayContaining(['record.create', 'record.delete']),
    );
  });

  it('refuses records for an animal outside the household or already deleted', async () => {
    const first = await createHousehold();
    const second = await createHousehold();
    const animalId = await createAnimal(first);
    const occurredAt = new Date().toISOString();

    await expect(
      send(
        OWNER,
        'record.create',
        { animalId, type: 'note', occurredAt, note: 'cross household' },
        { householdId: second },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    success(
      await send(OWNER, 'animal.delete', { animalId }, { householdId: first, baseRevision: 0 }),
      'animal.delete',
    );

    await expect(
      send(
        OWNER,
        'record.create',
        { animalId, type: 'note', occurredAt, note: 'deleted animal' },
        { householdId: first },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('cannot reach a record through another household', async () => {
    const first = await createHousehold();
    const second = await createHousehold();
    const animalId = await createAnimal(first);
    const created = success(
      await send(
        OWNER,
        'record.create',
        { animalId, type: 'note', occurredAt: new Date().toISOString(), note: 'private' },
        { householdId: first },
      ),
      'record.create',
    );
    const recordId = (created.data as { recordId: string }).recordId;

    await expect(
      send(
        OWNER,
        'record.update',
        { recordId, note: 'leak' },
        { householdId: second, baseRevision: 0 },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      send(OWNER, 'record.delete', { recordId }, { householdId: second, baseRevision: 0 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect(await recordDoc(recordId)).toMatchObject({ note: 'private', revision: 0 });
  });

  it('records bot-sourced record commands as bot actors', async () => {
    const { householdId, animalId } = await setupAnimal();
    success(
      await send(
        OWNER,
        'record.create',
        { animalId, type: 'feeding', occurredAt: new Date().toISOString() },
        { householdId, source: 'bot' },
      ),
      'bot record.create',
    );

    const snap = await adminDb.collection(`households/${householdId}/auditLogs`).get();
    const recordEntries = snap.docs
      .map((doc) => doc.data())
      .filter((entry) => entry.action === 'record.create');
    expect(recordEntries).toHaveLength(1);
    expect(recordEntries[0]).toMatchObject({ actorType: 'bot', source: 'bot' });
  });
});
