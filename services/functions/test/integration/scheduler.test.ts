// Import the emulator helpers first so the emulator hosts are in place before
// the scheduler resolves its Firestore client.
import { adminDb, clearFirestore } from './helpers';
import { beforeEach, describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { completionId } from '../../src/lib/ids';
import { runReminderScheduler, type ReminderPusher } from '../../src/reminders/scheduler';

const NOW = new Date('2026-10-24T01:00:00.000Z'); // 09:00 Asia/Taipei
const DUE = new Date('2026-10-24T00:30:00.000Z'); // 08:30 Asia/Taipei
const NEXT_DAY = '2026-10-25T00:30:00.000Z'; // 08:30 Asia/Taipei the next day

const REMINDER = {
  householdId: 'h1',
  animalId: 'a1',
  title: '餵食',
  type: 'feeding',
  schedule: { kind: 'daily', times: ['08:30'] },
  timezone: 'Asia/Taipei',
  enabled: true,
  deletedAt: null,
};

type Push = { to: string; text: string };

function fakeGateway(): { pushes: Push[]; gateway: ReminderPusher } {
  const pushes: Push[] = [];
  return {
    pushes,
    gateway: {
      push: async (to, messages) => {
        pushes.push({ to, text: messages[0]?.text ?? '' });
      },
    },
  };
}

async function seedHousehold(settings: Record<string, unknown> = {}): Promise<void> {
  await adminDb
    .collection('households')
    .doc('h1')
    .set({ name: '苔間', timezone: 'Asia/Taipei', settings });
  await adminDb
    .collection('households/h1/members')
    .doc('u1')
    .set({ uid: 'u1', role: 'owner', status: 'active' });
}

async function seedAnimal(deletedAt: Timestamp | null = null): Promise<void> {
  await adminDb
    .collection('animals')
    .doc('a1')
    .set({
      householdId: 'h1',
      name: '阿肥',
      status: deletedAt ? 'archived' : 'active',
      deletedAt,
      cleanupPending: false,
    });
}

async function seedReminder(overrides: Record<string, unknown> = {}): Promise<void> {
  await adminDb
    .collection('reminders')
    .doc('r1')
    .set({ ...REMINDER, nextDueAt: Timestamp.fromDate(DUE), ...overrides });
}

async function seedMapping(lineUserId: string, uid: string, status: string): Promise<void> {
  await adminDb.collection('lineUsers').doc(lineUserId).set({ uid, status });
}

async function nextDueAt(): Promise<Timestamp> {
  const snap = await adminDb.collection('reminders').doc('r1').get();
  return snap.data()?.nextDueAt as Timestamp;
}

async function notificationLog(): Promise<Record<string, unknown> | undefined> {
  const snap = await adminDb.collection('notificationLog').doc('r1_2026-10-24_line').get();
  return snap.data();
}

beforeEach(async () => {
  await clearFirestore();
});

describe('runReminderScheduler', () => {
  it('pushes once per active LINE mapping and advances the schedule', async () => {
    await seedHousehold();
    await seedAnimal();
    await seedReminder();
    await seedMapping('line-active', 'u1', 'active');
    await seedMapping('line-unlinked', 'u1', 'unlinked');
    await seedMapping('line-deleted', 'u1', 'deleted');

    const { pushes, gateway } = fakeGateway();
    const summary = await runReminderScheduler({ now: NOW, gateway });

    expect(summary).toEqual({ due: 1, notified: 1, skipped: 0, retired: 0 });
    expect(pushes).toHaveLength(1);
    expect(pushes[0]?.to).toBe('line-active');
    expect(pushes[0]?.text).toContain('提醒：餵食');
    expect(pushes[0]?.text).toContain('/animals/a1');

    expect((await nextDueAt()).toDate().toISOString()).toBe(NEXT_DAY);
    expect(await notificationLog()).toMatchObject({
      householdId: 'h1',
      reminderId: 'r1',
      dueDate: '2026-10-24',
      channel: 'line',
      status: 'sent',
      delivered: 1,
      failed: 0,
    });
  });

  it('keeps delivery history for 30 days', async () => {
    await seedHousehold();
    await seedAnimal();
    await seedReminder();
    await seedMapping('line-active', 'u1', 'active');

    const { gateway } = fakeGateway();
    await runReminderScheduler({ now: NOW, gateway });

    const log = await notificationLog();
    const expiresAt = log?.expiresAt as Timestamp;
    expect(expiresAt.toMillis()).toBe(NOW.getTime() + 30 * 86_400_000);
  });

  it('does not send the same occurrence twice even if the schedule is re-queued', async () => {
    await seedHousehold();
    await seedAnimal();
    await seedReminder();
    await seedMapping('line-active', 'u1', 'active');

    const { pushes, gateway } = fakeGateway();
    await runReminderScheduler({ now: NOW, gateway });
    // Force the same occurrence to become due again, as a stale write would.
    await seedReminder();

    const second = await runReminderScheduler({ now: NOW, gateway });

    expect(second).toEqual({ due: 1, notified: 0, skipped: 1, retired: 0 });
    expect(pushes).toHaveLength(1);
    expect((await nextDueAt()).toDate().toISOString()).toBe(NEXT_DAY);
  });

  it('stays silent during quiet hours without advancing the schedule', async () => {
    await seedHousehold({
      notificationsEnabled: true,
      quietHours: { start: '08:00', end: '10:00' },
    });
    await seedAnimal();
    await seedReminder();
    await seedMapping('line-active', 'u1', 'active');

    const { pushes, gateway } = fakeGateway();
    const summary = await runReminderScheduler({ now: NOW, gateway });

    expect(summary).toEqual({ due: 1, notified: 0, skipped: 1, retired: 0 });
    expect(pushes).toHaveLength(0);
    // Still due, so the 10:00 tick after quiet hours can deliver it.
    expect((await nextDueAt()).toDate().toISOString()).toBe(DUE.toISOString());
    expect(await notificationLog()).toBeUndefined();
  });

  it('skips a completed occurrence and advances the schedule', async () => {
    await seedHousehold();
    await seedAnimal();
    await seedReminder();
    await seedMapping('line-active', 'u1', 'active');
    await adminDb
      .collection('taskCompletions')
      .doc(completionId('r1', '2026-10-24'))
      .set({
        householdId: 'h1',
        reminderId: 'r1',
        dueDate: '2026-10-24',
        completedAt: Timestamp.fromDate(new Date('2026-10-24T00:45:00.000Z')),
        completedBy: 'u1',
      });

    const { pushes, gateway } = fakeGateway();
    const summary = await runReminderScheduler({ now: NOW, gateway });

    expect(pushes).toHaveLength(0);
    expect(summary.skipped).toBe(1);
    expect((await nextDueAt()).toDate().toISOString()).toBe(NEXT_DAY);
    const reminder = await adminDb.collection('reminders').doc('r1').get();
    expect((reminder.data()?.lastCompletedAt as Timestamp).toDate().toISOString()).toBe(
      '2026-10-24T00:45:00.000Z',
    );
    expect(await notificationLog()).toBeUndefined();
  });

  it('advances without sending when the household disabled notifications', async () => {
    await seedHousehold({ notificationsEnabled: false });
    await seedAnimal();
    await seedReminder();
    await seedMapping('line-active', 'u1', 'active');

    const { pushes, gateway } = fakeGateway();
    await runReminderScheduler({ now: NOW, gateway });

    expect(pushes).toHaveLength(0);
    expect((await nextDueAt()).toDate().toISOString()).toBe(NEXT_DAY);
    expect(await notificationLog()).toBeUndefined();
  });

  it('records a failed push without rolling back the schedule', async () => {
    await seedHousehold();
    await seedAnimal();
    await seedReminder();
    await seedMapping('line-active', 'u1', 'active');

    const failing: ReminderPusher = {
      push: async () => {
        throw new Error('LINE API /v2/bot/message/push failed with 400');
      },
    };
    const summary = await runReminderScheduler({ now: NOW, gateway: failing });

    expect(summary).toEqual({ due: 1, notified: 0, skipped: 1, retired: 0 });
    expect((await nextDueAt()).toDate().toISOString()).toBe(NEXT_DAY);
    expect(await notificationLog()).toMatchObject({
      status: 'failed',
      delivered: 0,
      failed: 1,
    });
  });

  it('retires reminders left behind for a deleted animal', async () => {
    await seedHousehold();
    await seedAnimal(Timestamp.fromDate(new Date('2026-10-23T00:00:00.000Z')));
    await seedReminder();
    await seedMapping('line-active', 'u1', 'active');

    const { pushes, gateway } = fakeGateway();
    const summary = await runReminderScheduler({ now: NOW, gateway });

    expect(summary).toEqual({ due: 1, notified: 0, skipped: 0, retired: 1 });
    expect(pushes).toHaveLength(0);
    const reminder = await adminDb.collection('reminders').doc('r1').get();
    expect(reminder.data()?.enabled).toBe(false);
  });

  it('retires a soft-deleted reminder that is still enabled', async () => {
    await seedHousehold();
    await seedAnimal();
    await seedReminder({ deletedAt: Timestamp.fromDate(new Date('2026-10-23T00:00:00.000Z')) });
    await seedMapping('line-active', 'u1', 'active');

    const { pushes, gateway } = fakeGateway();
    await runReminderScheduler({ now: NOW, gateway });

    expect(pushes).toHaveLength(0);
    const reminder = await adminDb.collection('reminders').doc('r1').get();
    expect(reminder.data()?.enabled).toBe(false);
  });
});
