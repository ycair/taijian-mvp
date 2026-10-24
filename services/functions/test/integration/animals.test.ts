import { beforeEach, describe, expect, it } from 'vitest';
import type { CommandResult, CommandSuccess } from '@taijian/domain';
import { runCommand } from '../../src/commands/runCommand';
import { commandHandlers } from '../../src/commands/registry';
import type { Source } from '../../src/commands/types';
import { CASCADE_RECORD_LIMIT } from '../../src/commands/handlers/animals';
import { adminDb, clearFirestore, envelope, seedUser } from './helpers';

const OWNER = 'u1';
const CARETAKER = 'u2';
const OUTSIDER = 'u3';

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

async function animalDoc(animalId: string): Promise<Record<string, any> | undefined> {
  return (await adminDb.collection('animals').doc(animalId).get()).data();
}

async function recordsFor(animalId: string): Promise<Array<Record<string, any>>> {
  const snap = await adminDb.collection('records').where('animalId', '==', animalId).get();
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
  await seedUser(OUTSIDER);
});

describe('animal commands', () => {
  it('creates an animal and increments revision on update', async () => {
    const householdId = await createHousehold();
    const animalId = await createAnimal(householdId);

    expect(await animalDoc(animalId)).toMatchObject({
      householdId,
      name: '阿肥',
      species: 'leopard-gecko',
      status: 'active',
      revision: 0,
      schemaVersion: 1,
      createdBy: OWNER,
      updatedBy: OWNER,
      updatedFrom: 'test',
      deletedAt: null,
      lastChangedFields: [],
    });

    const updated = await send(
      OWNER,
      'animal.update',
      { animalId, notes: '68g' },
      { householdId, baseRevision: 0 },
    );
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.revision).toBe(1);

    // The payload must have produced a real write, not just a revision bump.
    expect(await animalDoc(animalId)).toMatchObject({
      notes: '68g',
      revision: 1,
      lastChangedFields: ['notes'],
      updatedBy: OWNER,
      updatedFrom: 'test',
    });
    expect(await auditActions(householdId)).toEqual(
      expect.arrayContaining(['animal.create', 'animal.update']),
    );
  });

  it('returns CONFLICT with the current document when two edits use the same baseRevision', async () => {
    const householdId = await createHousehold();
    await addCaretaker(householdId);
    const animalId = await createAnimal(householdId);

    success(
      await send(
        OWNER,
        'animal.update',
        { animalId, notes: 'first' },
        { householdId, baseRevision: 0 },
      ),
      'first animal.update',
    );

    await expect(
      send(
        CARETAKER,
        'animal.update',
        { animalId, notes: 'second' },
        { householdId, baseRevision: 0 },
      ),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      details: {
        currentRevision: 1,
        lastChangedFields: ['notes'],
        current: expect.objectContaining({ notes: 'first', revision: 1 }),
      },
    });

    // The losing write must not have landed.
    expect(await animalDoc(animalId)).toMatchObject({ notes: 'first', revision: 1 });
  });

  it('requires baseRevision for an update', async () => {
    const householdId = await createHousehold();
    const animalId = await createAnimal(householdId);

    await expect(
      send(OWNER, 'animal.update', { animalId, notes: 'x' }, { householdId }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('cannot change lifecycle status through animal.update', async () => {
    const householdId = await createHousehold();
    await addCaretaker(householdId);
    const animalId = await createAnimal(householdId);

    // `status` is not part of UpdateAnimalPayload and is stripped before the handler runs.
    success(
      await send(
        CARETAKER,
        'animal.update',
        { animalId, status: 'memorial', notes: 'healthy' },
        { householdId, baseRevision: 0 },
      ),
      'animal.update',
    );

    expect(await animalDoc(animalId)).toMatchObject({
      status: 'active',
      notes: 'healthy',
      revision: 1,
      lastChangedFields: ['notes'],
    });
  });

  it('lets a caretaker create and edit an animal but not archive or delete it', async () => {
    const householdId = await createHousehold();
    await addCaretaker(householdId);

    const animalId = await createAnimal(householdId, CARETAKER);

    success(
      await send(
        CARETAKER,
        'animal.update',
        { animalId, name: '阿肥二號' },
        { householdId, baseRevision: 0 },
      ),
      'caretaker animal.update',
    );
    expect(await animalDoc(animalId)).toMatchObject({ name: '阿肥二號', revision: 1 });

    await expect(
      send(CARETAKER, 'animal.archive', { animalId }, { householdId, baseRevision: 1 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      send(CARETAKER, 'animal.delete', { animalId }, { householdId, baseRevision: 1 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(await animalDoc(animalId)).toMatchObject({ status: 'active', deletedAt: null });
  });

  it('archives an animal for the owner', async () => {
    const householdId = await createHousehold();
    const animalId = await createAnimal(householdId);

    const archived = await send(
      OWNER,
      'animal.archive',
      { animalId },
      { householdId, baseRevision: 0 },
    );
    expect(archived.ok).toBe(true);
    if (!archived.ok) return;
    expect(archived.data).toMatchObject({ animalId, status: 'archived' });
    expect(archived.revision).toBe(1);

    expect(await animalDoc(animalId)).toMatchObject({
      status: 'archived',
      revision: 1,
      lastChangedFields: ['status'],
      deletedAt: null,
    });
    expect(await auditActions(householdId)).toContain('animal.archive');
  });

  it('soft deletes an animal and hides its records', async () => {
    const householdId = await createHousehold();
    await addCaretaker(householdId);
    const animalId = await createAnimal(householdId);

    const occurredAt = new Date().toISOString();
    success(
      await send(
        OWNER,
        'record.create',
        { animalId, type: 'weight', occurredAt, value: 68, unit: 'g' },
        { householdId },
      ),
      'owner record.create',
    );
    success(
      await send(
        CARETAKER,
        'record.create',
        { animalId, type: 'feeding', occurredAt, note: '吃了兩隻蟋蟀' },
        { householdId },
      ),
      'caretaker record.create',
    );
    expect(await recordsFor(animalId)).toHaveLength(2);

    const deleted = await send(
      OWNER,
      'animal.delete',
      { animalId },
      { householdId, baseRevision: 0 },
    );
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    expect(deleted.data).toMatchObject({ animalId, deleted: true });

    expect(await animalDoc(animalId)).toMatchObject({
      status: 'archived',
      revision: 1,
      cleanupPending: false,
    });
    expect((await animalDoc(animalId))?.deletedAt).not.toBeNull();

    // No record of a deleted animal may remain visible.
    const records = await recordsFor(animalId);
    expect(records).toHaveLength(2);
    for (const record of records) {
      expect(record.deletedAt).not.toBeNull();
      expect(record.deletedWithAnimal).toBe(animalId);
    }

    // Writes against a deleted animal are refused, so nothing can reappear.
    await expect(
      send(
        OWNER,
        'record.create',
        { animalId, type: 'note', occurredAt: new Date().toISOString(), note: 'after delete' },
        { householdId },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await expect(
      send(OWNER, 'animal.update', { animalId, notes: 'ghost' }, { householdId, baseRevision: 1 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect(await auditActions(householdId)).toContain('animal.delete');
  });

  it('bounds the cascade and flags cleanupPending for long histories', async () => {
    const householdId = await createHousehold();
    const animalId = await createAnimal(householdId);

    const batch = adminDb.batch();
    for (let index = 0; index <= CASCADE_RECORD_LIMIT; index += 1) {
      const ref = adminDb.collection('records').doc();
      batch.set(ref, {
        householdId,
        animalId,
        type: 'note',
        occurredAt: new Date().toISOString(),
        note: `seeded ${index}`,
        source: 'test',
        sourceEventId: null,
        revision: 0,
        createdBy: OWNER,
        deletedAt: null,
        lastChangedFields: [],
      });
    }
    await batch.commit();

    const deleted = await send(
      OWNER,
      'animal.delete',
      { animalId },
      { householdId, baseRevision: 0 },
    );
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    expect(deleted.data).toMatchObject({ cleanupPending: true });

    expect(await animalDoc(animalId)).toMatchObject({ cleanupPending: true });

    // The delete must succeed and stay within transaction limits: the overflow is
    // left for the purge job rather than failing the command.
    const records = await recordsFor(animalId);
    expect(records).toHaveLength(CASCADE_RECORD_LIMIT + 1);
    expect(records.filter((record) => record.deletedAt != null)).toHaveLength(CASCADE_RECORD_LIMIT);
  });

  it('rejects commands from a non-member', async () => {
    const householdId = await createHousehold();

    await expect(send(OUTSIDER, 'animal.create', ANIMAL, { householdId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('cannot reach an animal through another household', async () => {
    const first = await createHousehold();
    const second = await createHousehold();
    const animalId = await createAnimal(first);

    await expect(
      send(
        OWNER,
        'animal.update',
        { animalId, notes: 'leak' },
        { householdId: second, baseRevision: 0 },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('records bot-sourced animal commands as bot actors', async () => {
    const householdId = await createHousehold();
    success(
      await send(OWNER, 'animal.create', ANIMAL, { householdId, source: 'bot' }),
      'bot animal.create',
    );

    const snap = await adminDb.collection(`households/${householdId}/auditLogs`).get();
    const animalEntries = snap.docs
      .map((doc) => doc.data())
      .filter((entry) => entry.action.startsWith('animal.'));
    expect(animalEntries).toHaveLength(1);
    expect(animalEntries[0]).toMatchObject({ actorType: 'bot', source: 'bot' });
  });
});
