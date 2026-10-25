import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { config } from '../../src/config';
import { loginWithLine } from '../../src/auth/line';
import { commandHandlers } from '../../src/commands/registry';
import { runCommand } from '../../src/commands/runCommand';
import type { Source } from '../../src/commands/types';
import { clearAuthUserCache } from '../../src/lib/authUser';
import { completionId } from '../../src/lib/ids';
import { clearLineVerifyCache } from '../../src/line/verify';
import {
  adminRetryDeleteAccount,
  deleteAccount,
  deleteAccountData,
  type DeleteAccountResult,
} from '../../src/user/deleteAccount';
import type { CommandResult, CommandSuccess } from '@taijian/domain';
import { adminAuth, adminDb, clearAuth, clearFirestore, envelope, seedUser } from './helpers';

const OWNER = 'u1';
const CARETAKER = 'u2';
const DUE = '2026-10-24';

const ANIMAL = {
  name: '阿肥',
  species: 'leopard-gecko',
  sex: 'unknown' as const,
  avatarColor: '#7C9A76',
};

const DAILY = { kind: 'daily' as const, times: ['08:30'] };

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

async function createReminder(
  householdId: string,
  animalId: string,
  overrides: Record<string, unknown> = {},
  uid = OWNER,
): Promise<string> {
  const result = success(
    await send(
      uid,
      'reminder.create',
      {
        animalId,
        title: '餵食',
        type: 'feeding',
        schedule: DAILY,
        timezone: 'Asia/Taipei',
        ...overrides,
      },
      { householdId },
    ),
    'reminder.create',
  );
  return (result.data as { reminderId: string }).reminderId;
}

async function reminderDoc(reminderId: string): Promise<Record<string, any> | undefined> {
  return (await adminDb.collection('reminders').doc(reminderId).get()).data();
}

async function completionDoc(id: string): Promise<Record<string, any> | undefined> {
  return (await adminDb.collection('taskCompletions').doc(id).get()).data();
}

async function auditEntries(householdId: string): Promise<Array<Record<string, any>>> {
  const snap = await adminDb.collection(`households/${householdId}/auditLogs`).get();
  return snap.docs.map((doc) => doc.data());
}

async function auditActions(householdId: string): Promise<string[]> {
  return (await auditEntries(householdId)).map((entry) => entry.action as string);
}

function localTime(date: Date, timezone = 'Asia/Taipei'): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function stubLineVerify(sub: string, name = 'Test A'): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        aud: config.LINE_LOGIN_CHANNEL_ID,
        sub,
        name,
        picture: 'https://example.com/picture.png',
        iss: 'https://access.line.me',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    }),
  );
}

beforeEach(async () => {
  await Promise.all([clearFirestore(), clearAuth()]);
  clearLineVerifyCache();
  clearAuthUserCache();
  await seedUser(OWNER);
  await seedUser(CARETAKER);
});

afterEach(() => {
  // The LINE verifier stubs `fetch`; never let it leak into the next test file.
  vi.unstubAllGlobals();
});

describe('reminder commands', () => {
  it('creates a reminder with a computed next due date and an audit entry', async () => {
    const { householdId, animalId } = await setupAnimal();

    const result = success(
      await send(
        OWNER,
        'reminder.create',
        {
          animalId,
          title: '餵食',
          type: 'feeding',
          schedule: DAILY,
          timezone: 'Asia/Taipei',
        },
        { householdId },
      ),
      'reminder.create',
    );
    const reminderId = (result.data as { reminderId: string }).reminderId;

    const doc = await reminderDoc(reminderId);
    expect(doc).toMatchObject({
      householdId,
      animalId,
      title: '餵食',
      type: 'feeding',
      enabled: true,
      revision: 0,
      schemaVersion: 1,
      createdBy: OWNER,
      deletedAt: null,
      lastChangedFields: [],
    });
    const nextDueAt = doc?.nextDueAt as Timestamp;
    expect(nextDueAt.toDate().getTime()).toBeGreaterThan(Date.now() - 1_000);
    // The stored schedule keeps the local wall clock time in its timezone.
    expect(localTime(nextDueAt.toDate())).toBe('08:30');
    expect((result.data as { nextDueAt: string }).nextDueAt).toBe(nextDueAt.toDate().toISOString());
    expect(result.revision).toBe(0);
    expect(await auditActions(householdId)).toContain('reminder.create');
  });

  it('rejects a reminder for an animal outside the household or already deleted', async () => {
    const first = await setupAnimal();
    const second = await createHousehold();
    const payload = {
      animalId: first.animalId,
      title: '餵食',
      type: 'feeding',
      schedule: DAILY,
      timezone: 'Asia/Taipei',
    };

    await expect(
      send(OWNER, 'reminder.create', payload, { householdId: second }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    success(
      await send(
        OWNER,
        'animal.delete',
        { animalId: first.animalId },
        {
          householdId: first.householdId,
          baseRevision: 0,
        },
      ),
      'animal.delete',
    );
    await expect(
      send(OWNER, 'reminder.create', payload, { householdId: first.householdId }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('recomputes nextDueAt on update and rejects a stale revision', async () => {
    const { householdId, animalId } = await setupAnimal();
    const reminderId = await createReminder(householdId, animalId);

    const updated = success(
      await send(
        OWNER,
        'reminder.update',
        { reminderId, schedule: { kind: 'daily', times: ['21:15'] } },
        { householdId, baseRevision: 0 },
      ),
      'reminder.update',
    );
    expect(updated.revision).toBe(1);
    const doc = await reminderDoc(reminderId);
    expect(doc).toMatchObject({ revision: 1, updatedBy: OWNER });
    expect(localTime((doc?.nextDueAt as Timestamp).toDate())).toBe('21:15');
    // The derived field is part of the change set, the patch fields are too.
    expect(doc?.lastChangedFields).toEqual(expect.arrayContaining(['schedule', 'nextDueAt']));
    expect(await auditActions(householdId)).toContain('reminder.update');

    await expect(
      send(
        OWNER,
        'reminder.update',
        { reminderId, title: '換標題' },
        {
          householdId,
          baseRevision: 0,
        },
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await reminderDoc(reminderId)).toMatchObject({ revision: 1 });
  });

  it('does not mark enabled as changed when a title edit keeps the same value', async () => {
    const { householdId, animalId } = await setupAnimal();
    const reminderId = await createReminder(householdId, animalId);
    const before = await reminderDoc(reminderId);
    const beforeDueAt = (before?.nextDueAt as Timestamp).toMillis();

    success(
      await send(
        OWNER,
        'reminder.update',
        { reminderId, title: '換標題', enabled: true },
        { householdId, baseRevision: 0 },
      ),
      'reminder.update title',
    );

    const after = await reminderDoc(reminderId);
    expect(after?.title).toBe('換標題');
    expect(after?.enabled).toBe(true);
    expect((after?.nextDueAt as Timestamp).toMillis()).toBe(beforeDueAt);
    expect(after?.lastChangedFields).toContain('title');
    expect(after?.lastChangedFields).not.toContain('enabled');
    expect(after?.enabledChangedAt).toBeUndefined();
  });

  it('ignores client-supplied derived fields and refuses a moving animal', async () => {
    const { householdId, animalId } = await setupAnimal();
    const otherAnimalId = await createAnimal(householdId);
    const reminderId = await createReminder(householdId, animalId);

    success(
      await send(
        OWNER,
        'reminder.update',
        { reminderId, nextDueAt: '2000-01-01T00:00:00.000Z', deletedAt: null, title: '新標題' },
        { householdId, baseRevision: 0 },
      ),
      'reminder.update',
    );
    const doc = await reminderDoc(reminderId);
    expect(doc?.title).toBe('新標題');
    expect((doc?.nextDueAt as Timestamp).toDate().getTime()).toBeGreaterThan(Date.now() - 1_000);
    expect(doc?.deletedAt).toBeNull();

    // Moving a reminder to another household's animal is not possible.
    const second = await setupAnimal();
    await expect(
      send(
        OWNER,
        'reminder.update',
        { reminderId, animalId: second.animalId },
        { householdId, baseRevision: 1 },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await reminderDoc(reminderId)).toMatchObject({ animalId, revision: 1 });

    success(
      await send(
        OWNER,
        'reminder.update',
        { reminderId, animalId: otherAnimalId },
        {
          householdId,
          baseRevision: 1,
        },
      ),
      'reminder.update animal',
    );
    expect(await reminderDoc(reminderId)).toMatchObject({ animalId: otherAnimalId, revision: 2 });
  });

  it('soft deletes a reminder and hides it from later commands', async () => {
    const { householdId, animalId } = await setupAnimal();
    const reminderId = await createReminder(householdId, animalId);

    const deleted = success(
      await send(OWNER, 'reminder.delete', { reminderId }, { householdId, baseRevision: 0 }),
      'reminder.delete',
    );
    expect(deleted.revision).toBe(1);
    expect(deleted.data).toMatchObject({ reminderId, deleted: true });
    const doc = await reminderDoc(reminderId);
    expect(doc).toMatchObject({ enabled: false, revision: 1, updatedBy: OWNER });
    expect(doc?.deletedAt).not.toBeNull();
    expect(await auditActions(householdId)).toContain('reminder.delete');

    await expect(
      send(OWNER, 'reminder.delete', { reminderId }, { householdId, baseRevision: 1 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      send(
        OWNER,
        'reminder.update',
        { reminderId, title: '再改' },
        {
          householdId,
          baseRevision: 1,
        },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await reminderDoc(reminderId)).toMatchObject({ revision: 1 });
  });

  it('keeps reminders inside their household', async () => {
    const first = await setupAnimal();
    const second = await setupAnimal();
    const reminderId = await createReminder(first.householdId, first.animalId);

    await expect(
      send(
        OWNER,
        'reminder.update',
        { reminderId, title: '洩漏' },
        {
          householdId: second.householdId,
          baseRevision: 0,
        },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      send(
        OWNER,
        'reminder.delete',
        { reminderId },
        {
          householdId: second.householdId,
          baseRevision: 0,
        },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await reminderDoc(reminderId)).toMatchObject({ revision: 0 });
  });

  it('lets a caretaker manage reminders and audits bot-sourced writes', async () => {
    const { householdId, animalId } = await setupAnimal();
    await addCaretaker(householdId);

    const reminderId = await createReminder(householdId, animalId, {}, CARETAKER);
    success(
      await send(CARETAKER, 'reminder.delete', { reminderId }, { householdId, baseRevision: 0 }),
      'caretaker reminder.delete',
    );

    success(
      await send(
        OWNER,
        'reminder.create',
        {
          animalId,
          title: '換水',
          type: 'water',
          schedule: { kind: 'weekly', times: ['09:00'], weekdays: [1] },
          timezone: 'Asia/Taipei',
        },
        { householdId, source: 'bot' },
      ),
      'bot reminder.create',
    );

    const botEntries = (await auditEntries(householdId)).filter(
      (entry) => entry.action === 'reminder.create' && entry.source === 'bot',
    );
    expect(botEntries).toHaveLength(1);
    expect(botEntries[0]).toMatchObject({ actorType: 'bot', actorUid: OWNER });
  });
});

describe('task completions', () => {
  it('completes once and gives the second completer the original completedBy', async () => {
    const { householdId, animalId } = await setupAnimal();
    await addCaretaker(householdId);
    const reminderId = await createReminder(householdId, animalId);

    const first = success(
      await send(OWNER, 'task.complete', { reminderId, dueDate: DUE }, { householdId }),
      'owner task.complete',
    );
    const id = completionId(reminderId, DUE);
    expect(first.data).toMatchObject({
      completionId: id,
      completedBy: OWNER,
      completedByName: OWNER,
    });
    expect((first.data as { completedAt: string }).completedAt).toEqual(expect.any(String));
    expect(await completionDoc(id)).toMatchObject({
      householdId,
      animalId,
      reminderId,
      dueDate: DUE,
      completedBy: OWNER,
      completedByName: OWNER,
      source: 'test',
    });

    const second = success(
      await send(CARETAKER, 'task.complete', { reminderId, dueDate: DUE }, { householdId }),
      'caretaker task.complete',
    );
    expect(second.data).toMatchObject({
      completionId: id,
      alreadyCompleted: true,
      completedBy: OWNER,
      completedByName: OWNER,
    });
    // The retry reports the original completion time, not "now".
    expect((second.data as { completedAt: string }).completedAt).toBe(
      (first.data as { completedAt: string }).completedAt,
    );
    expect(await completionDoc(id)).toMatchObject({ completedBy: OWNER });

    const completeAudits = (await auditActions(householdId)).filter(
      (action) => action === 'task.complete',
    );
    expect(completeAudits).toHaveLength(1);
  });

  it('stores the member display name at completion time', async () => {
    const { householdId, animalId } = await setupAnimal();
    await addCaretaker(householdId);
    const reminderId = await createReminder(householdId, animalId);
    // A rename updates the profile, not the membership snapshot; the completion
    // records whichever name the membership carried when it was written.
    await adminDb
      .doc(`households/${householdId}/members/${CARETAKER}`)
      .set({ displayName: '阿明' }, { merge: true });

    const completed = success(
      await send(CARETAKER, 'task.complete', { reminderId, dueDate: DUE }, { householdId }),
      'caretaker task.complete',
    );

    expect(completed.data).toMatchObject({ completedBy: CARETAKER, completedByName: '阿明' });
    expect(await completionDoc(completionId(reminderId, DUE))).toMatchObject({
      completedByName: '阿明',
    });
  });

  it('converges when two members complete the same occurrence concurrently', async () => {
    const { householdId, animalId } = await setupAnimal();
    await addCaretaker(householdId);
    const reminderId = await createReminder(householdId, animalId);
    const id = completionId(reminderId, DUE);

    // Different command ids, different members, same occurrence: both commands
    // enter a transaction that reads "no completion" and race to create it.
    const [ownerResult, caretakerResult] = await Promise.all([
      send(OWNER, 'task.complete', { reminderId, dueDate: DUE }, { householdId }),
      send(CARETAKER, 'task.complete', { reminderId, dueDate: DUE }, { householdId }),
    ]);
    const owner = success(ownerResult, 'owner task.complete');
    const caretaker = success(caretakerResult, 'caretaker task.complete');

    const stored = await completionDoc(id);
    expect([OWNER, CARETAKER]).toContain(stored?.completedBy);

    const responses = [owner.data, caretaker.data] as Array<{
      completionId: string;
      completedBy: string;
      alreadyCompleted?: boolean;
    }>;
    for (const data of responses) {
      expect(data).toMatchObject({ completionId: id, completedBy: stored?.completedBy });
    }

    // The transaction that committed the write has no `alreadyCompleted` flag;
    // the retried transaction observes it. Exactly one of each.
    const writers = responses.filter((data) => !data.alreadyCompleted);
    expect(writers).toHaveLength(1);
    expect(writers[0]?.completedBy).toBe(stored?.completedBy);
    expect(responses.filter((data) => data.alreadyCompleted)).toHaveLength(1);

    const snap = await adminDb
      .collection('taskCompletions')
      .where('reminderId', '==', reminderId)
      .get();
    expect(snap.docs).toHaveLength(1);

    // Only the winning write is audited.
    const completeAudits = (await auditActions(householdId)).filter(
      (action) => action === 'task.complete',
    );
    expect(completeAudits).toHaveLength(1);
  });

  it('treats another due date of the same reminder as a separate completion', async () => {
    const { householdId, animalId } = await setupAnimal();
    const reminderId = await createReminder(householdId, animalId);

    success(
      await send(OWNER, 'task.complete', { reminderId, dueDate: '2026-10-24' }, { householdId }),
      'first completion',
    );
    success(
      await send(OWNER, 'task.complete', { reminderId, dueDate: '2026-10-25' }, { householdId }),
      'second completion',
    );

    const snap = await adminDb
      .collection('taskCompletions')
      .where('reminderId', '==', reminderId)
      .get();
    expect(snap.docs.map((doc) => doc.data().dueDate).sort()).toEqual(['2026-10-24', '2026-10-25']);
  });

  it('lets only the completer or an owner undo a completion', async () => {
    const { householdId, animalId } = await setupAnimal();
    await addCaretaker(householdId);
    const reminderId = await createReminder(householdId, animalId);
    const id = completionId(reminderId, DUE);

    success(
      await send(OWNER, 'task.complete', { reminderId, dueDate: DUE }, { householdId }),
      'owner task.complete',
    );

    await expect(
      send(CARETAKER, 'task.uncomplete', { reminderId, dueDate: DUE }, { householdId }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await completionDoc(id)).toBeDefined();

    // The owner may undo someone else's completion.
    success(
      await send(OWNER, 'task.uncomplete', { reminderId, dueDate: DUE }, { householdId }),
      'owner task.uncomplete',
    );
    expect(await completionDoc(id)).toBeUndefined();
    expect(await auditActions(householdId)).toContain('task.uncomplete');

    // A caretaker may undo their own completion.
    const ownDue = '2026-10-26';
    success(
      await send(CARETAKER, 'task.complete', { reminderId, dueDate: ownDue }, { householdId }),
      'caretaker task.complete',
    );
    success(
      await send(CARETAKER, 'task.uncomplete', { reminderId, dueDate: ownDue }, { householdId }),
      'caretaker task.uncomplete',
    );
    expect(await completionDoc(completionId(reminderId, ownDue))).toBeUndefined();

    // Undoing a completion that is already gone reports NOT_FOUND.
    await expect(
      send(OWNER, 'task.uncomplete', { reminderId, dueDate: DUE }, { householdId }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses completions for another household', async () => {
    const first = await setupAnimal();
    const second = await setupAnimal();
    const reminderId = await createReminder(first.householdId, first.animalId);

    await expect(
      send(
        OWNER,
        'task.complete',
        { reminderId, dueDate: DUE },
        {
          householdId: second.householdId,
        },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await completionDoc(completionId(reminderId, DUE))).toBeUndefined();

    // A completion document from another household is invisible too.
    const id = completionId(reminderId, DUE);
    await adminDb.collection('taskCompletions').doc(id).set({
      householdId: first.householdId,
      reminderId,
      dueDate: DUE,
      completedBy: OWNER,
    });
    await expect(
      send(
        OWNER,
        'task.uncomplete',
        { reminderId, dueDate: DUE },
        {
          householdId: second.householdId,
        },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await completionDoc(id)).toBeDefined();

    // A forged completion that claims another household must not be returned
    // as this household's success, even when the reminder itself belongs here.
    const forgedDue = '2026-10-27';
    const forgedId = completionId(reminderId, forgedDue);
    await adminDb.collection('taskCompletions').doc(forgedId).set({
      householdId: second.householdId,
      reminderId,
      dueDate: forgedDue,
      completedBy: CARETAKER,
    });
    await expect(
      send(
        OWNER,
        'task.complete',
        { reminderId, dueDate: forgedDue },
        { householdId: first.householdId },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await completionDoc(forgedId)).toMatchObject({
      householdId: second.householdId,
      completedBy: CARETAKER,
    });
  });

  it('records bot-sourced completions as bot actors', async () => {
    const { householdId, animalId } = await setupAnimal();
    const reminderId = await createReminder(householdId, animalId);

    success(
      await send(
        OWNER,
        'task.complete',
        { reminderId, dueDate: DUE },
        {
          householdId,
          source: 'bot',
        },
      ),
      'bot task.complete',
    );
    const entries = (await auditEntries(householdId)).filter(
      (entry) => entry.action === 'task.complete',
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ actorType: 'bot', source: 'bot' });
  });
});

describe('deleteAccount', () => {
  it('refuses to delete an account that still owns a household with members', async () => {
    const { householdId } = await setupAnimal();
    await addCaretaker(householdId);

    await expect(deleteAccountData(OWNER)).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const household = (await adminDb.collection('households').doc(householdId).get()).data();
    expect(household?.deletedAt).toBeNull();
    expect((await adminDb.collection('users').doc(OWNER).get()).data()?.deletedAt).toBeUndefined();
    await expect(adminAuth.getUser(OWNER)).resolves.toMatchObject({ uid: OWNER });
  });

  it('checks memberships instead of trusting memberCount', async () => {
    const { householdId } = await setupAnimal();
    await addCaretaker(householdId);
    // Stale metadata must not let an owner orphan another member.
    await adminDb
      .collection('households')
      .doc(householdId)
      .set({ memberCount: 1 }, { merge: true });

    await expect(deleteAccountData(OWNER)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('deletes a sole-owner account, revokes invites, and tombstones LINE', async () => {
    const { householdId } = await setupAnimal();
    const invite = success(
      await send(OWNER, 'member.invite', { role: 'caretaker', expiresInDays: 7 }, { householdId }),
      'member.invite',
    );
    const inviteId = (invite.data as { inviteId: string }).inviteId;
    await adminDb.collection('lineUsers').doc('Uowner').set({
      uid: OWNER,
      status: 'active',
      linkedAt: Timestamp.now(),
    });

    const result = await deleteAccountData(OWNER);
    expect(result).toMatchObject({ deleted: true, alreadyDeleted: false });
    expect(result.deletedHouseholds).toEqual([householdId]);
    expect(result.leftHouseholds).toEqual([]);

    const household = (await adminDb.collection('households').doc(householdId).get()).data();
    expect(household).toMatchObject({ memberCount: 0, ownerCount: 0 });
    expect(household?.deletedAt).not.toBeNull();
    expect((await adminDb.doc(`households/${householdId}/members/${OWNER}`).get()).exists).toBe(
      false,
    );
    expect((await adminDb.collection('invites').doc(inviteId).get()).data()).toMatchObject({
      status: 'revoked',
      revokedBy: OWNER,
    });

    const user = (await adminDb.collection('users').doc(OWNER).get()).data();
    expect(user?.householdIds).toEqual([]);
    expect(user?.deletedAt).not.toBeNull();

    // The mapping survives as a tombstone so lineLogin cannot resurrect the UID.
    const mapping = (await adminDb.collection('lineUsers').doc('Uowner').get()).data();
    expect(mapping).toMatchObject({ uid: OWNER, status: 'deleted', deletedBy: OWNER });
    expect(mapping?.deletedAt).not.toBeNull();

    const accountAudit = await adminDb.collection(`users/${OWNER}/auditLogs`).get();
    expect(accountAudit.docs.map((doc) => doc.data().action)).toContain('account.delete');

    // The household timeline records why it disappeared, not only the account.
    const householdAudit = await auditEntries(householdId);
    expect(householdAudit.map((entry) => entry.action)).toContain('household.delete');
    expect(householdAudit.find((entry) => entry.action === 'household.delete')).toMatchObject({
      source: 'account.delete',
      actorType: 'user',
    });
    await expect(adminAuth.getUser(OWNER)).rejects.toMatchObject({ code: 'auth/user-not-found' });

    stubLineVerify('Uowner');
    await expect(loginWithLine('token-after-delete')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });

    const originalProfileDeletedAt = (user?.deletedAt as Timestamp).toMillis();
    const originalMappingDeletedAt = (mapping?.deletedAt as Timestamp).toMillis();

    // A retried call is a no-op instead of an error, and it must not move the
    // original deletion timestamps or append a second account audit entry.
    await expect(deleteAccountData(OWNER)).resolves.toMatchObject({
      deleted: true,
      alreadyDeleted: true,
    });
    const retriedUser = (await adminDb.collection('users').doc(OWNER).get()).data();
    expect((retriedUser?.deletedAt as Timestamp).toMillis()).toBe(originalProfileDeletedAt);
    const retriedMapping = (await adminDb.collection('lineUsers').doc('Uowner').get()).data();
    expect((retriedMapping?.deletedAt as Timestamp).toMillis()).toBe(originalMappingDeletedAt);
    const accountAudits = await adminDb.collection(`users/${OWNER}/auditLogs`).get();
    expect(accountAudits.docs.filter((doc) => doc.data().action === 'account.delete')).toHaveLength(
      1,
    );
  });

  it('limits the user-facing deletion to one attempt per hour', async () => {
    const { householdId } = await setupAnimal();
    await addCaretaker(householdId);

    // The refusal still spends the budget: the first attempt is charged before
    // the ownership pre-flight can reject it.
    await expect(deleteAccountData(OWNER)).rejects.toMatchObject({ code: 'FORBIDDEN' });

    success(
      await send(OWNER, 'member.remove', { uid: CARETAKER }, { householdId }),
      'member.remove',
    );

    await expect(deleteAccountData(OWNER)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    // Nothing was changed by the refused attempt.
    await expect(adminAuth.getUser(OWNER)).resolves.toMatchObject({ uid: OWNER });
    expect(
      (await adminDb.collection('households').doc(householdId).get()).data()?.deletedAt,
    ).toBeNull();
  });

  it('completes a half-deleted account through the admin retry path', async () => {
    const { householdId } = await setupAnimal();
    await adminDb.collection('lineUsers').doc('Uowner').set({ uid: OWNER, status: 'active' });

    // Simulate a crash after the Auth user was removed but before the profile and
    // household were tombstoned.
    await adminAuth.deleteUser(OWNER);
    expect((await adminDb.collection('users').doc(OWNER).get()).data()?.deletedAt).toBeUndefined();

    const retry = adminRetryDeleteAccount as unknown as {
      run: (request: unknown) => Promise<DeleteAccountResult>;
    };
    const result = await retry.run({
      auth: { uid: 'admin_ops', token: { admin: true } },
      data: { uid: OWNER },
    });

    expect(result).toMatchObject({ deleted: true, alreadyDeleted: false });
    expect(result.deletedHouseholds).toEqual([householdId]);
    const household = (await adminDb.collection('households').doc(householdId).get()).data();
    expect(household?.deletedAt).not.toBeNull();
    expect((await adminDb.collection('users').doc(OWNER).get()).data()?.deletedAt).not.toBeNull();
    expect((await adminDb.collection('lineUsers').doc('Uowner').get()).data()).toMatchObject({
      status: 'deleted',
    });

    // Idempotent: a second retry reports success without a duplicate audit row.
    const again = await retry.run({
      auth: { uid: 'admin_ops', token: { admin: true } },
      data: { uid: OWNER },
    });
    expect(again).toMatchObject({ deleted: true, alreadyDeleted: true });
    const audits = await adminDb
      .collection(`users/${OWNER}/auditLogs`)
      .where('action', '==', 'account.delete')
      .get();
    expect(audits.size).toBe(1);
  });

  it('refuses the admin retry path without the admin claim', async () => {
    const retry = adminRetryDeleteAccount as unknown as {
      run: (request: unknown) => Promise<unknown>;
    };
    await expect(
      retry.run({ auth: { uid: 'u_plain', token: { admin: false } }, data: { uid: OWNER } }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      retry.run({ auth: { uid: 'u_plain', token: {} }, data: { uid: OWNER } }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('handles a sole-owner household and a caretaker membership in one call', async () => {
    const owned = await setupAnimal();
    // The owner also acts as a caretaker in someone else's household.
    const other = await createHousehold(CARETAKER);
    const invite = success(
      await send(
        CARETAKER,
        'member.invite',
        { role: 'caretaker', expiresInDays: 7 },
        { householdId: other },
      ),
      'member.invite',
    );
    success(
      await send(OWNER, 'member.accept', { token: (invite.data as { token: string }).token }),
      'member.accept',
    );

    const result = await deleteAccountData(OWNER);
    expect(result.deletedHouseholds).toEqual([owned.householdId]);
    expect(result.leftHouseholds).toEqual([other]);

    const deleted = (await adminDb.collection('households').doc(owned.householdId).get()).data();
    expect(deleted).toMatchObject({ memberCount: 0 });
    expect(deleted?.deletedAt).not.toBeNull();

    const surviving = (await adminDb.collection('households').doc(other).get()).data();
    expect(surviving).toMatchObject({ memberCount: 1 });
    expect(surviving?.deletedAt).toBeNull();
    expect((await adminDb.doc(`households/${other}/members/${CARETAKER}`).get()).exists).toBe(true);
    expect((await adminDb.doc(`households/${other}/members/${OWNER}`).get()).exists).toBe(false);
    expect((await adminDb.collection('users').doc(OWNER).get()).data()?.householdIds).toEqual([]);
  });

  it('removes a caretaker membership without deleting the household', async () => {
    const { householdId } = await setupAnimal();
    await addCaretaker(householdId);

    const result = await deleteAccountData(CARETAKER);
    expect(result.leftHouseholds).toEqual([householdId]);
    expect(result.deletedHouseholds).toEqual([]);

    const household = (await adminDb.collection('households').doc(householdId).get()).data();
    expect(household?.memberCount).toBe(1);
    expect(household?.deletedAt).toBeNull();
    expect((await adminDb.doc(`households/${householdId}/members/${CARETAKER}`).get()).exists).toBe(
      false,
    );

    const user = (await adminDb.collection('users').doc(CARETAKER).get()).data();
    expect(user?.householdIds).toEqual([]);
    expect(user?.deletedAt).not.toBeNull();
    await expect(adminAuth.getUser(CARETAKER)).rejects.toMatchObject({
      code: 'auth/user-not-found',
    });
  });

  it('drops stale household pointers instead of failing', async () => {
    await seedUser(OWNER, ['h_missing']);
    await expect(deleteAccountData(OWNER)).resolves.toMatchObject({ deleted: true });
    expect((await adminDb.collection('users').doc(OWNER).get()).data()?.householdIds).toEqual([]);
  });

  it('rejects an unauthenticated callable request', async () => {
    const callable = deleteAccount as unknown as {
      run: (request: unknown) => Promise<unknown>;
    };
    await expect(callable.run({ data: {}, rawRequest: {} })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });
});
