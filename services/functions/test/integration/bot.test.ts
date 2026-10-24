// The bot handler reads LINE mappings, users, animals, and reminders, and runs
// real commands, so its behaviour is verified against the emulator.
import { Timestamp } from 'firebase-admin/firestore';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandResult, CommandSuccess } from '@taijian/domain';
import { commandHandlers } from '../../src/commands/registry';
import { runCommand } from '../../src/commands/runCommand';
import { botCommandId, handleLineEvent, type LineWebhookEvent } from '../../src/line/handler';
import { rateLimitDocId } from '../../src/lib/rateLimit';
import { adminDb, clearAuth, clearFirestore, envelope, readLimitCount, seedUser } from './helpers';

const OWNER = 'u_bot_owner';
const LINE_USER = 'U_bot_line_user';
const ANIMAL = {
  name: '阿肥',
  species: 'leopard-gecko',
  sex: 'unknown' as const,
  avatarColor: '#7C9A76',
};

type Recorder = {
  replies: string[];
  gateway: { reply: (token: string, messages: unknown[]) => Promise<void> };
};

function recorder(): Recorder {
  const replies: string[] = [];
  return {
    replies,
    gateway: {
      reply: async (_token: string, messages: unknown[]) => {
        for (const message of messages as Array<{ text: string }>) replies.push(message.text);
      },
    },
  };
}

let eventSeq = 0;

function messageEvent(text: string, overrides: Partial<LineWebhookEvent> = {}): LineWebhookEvent {
  eventSeq += 1;
  return {
    type: 'message',
    webhookEventId: `01H8101Z8S1638J0GZ5H0V0V${String(eventSeq).padStart(2, '0')}`,
    replyToken: `reply-${eventSeq}`,
    source: { type: 'user', userId: LINE_USER },
    message: { type: 'text', text },
    ...overrides,
  };
}

function success<T>(result: CommandResult<T>, label: string): CommandSuccess<T> {
  if (!result.ok) throw new Error(`${label} failed: ${result.message}`);
  return result;
}

function send(
  uid: string,
  type: string,
  payload: unknown,
  household?: string | { householdId?: string; baseRevision?: number },
): Promise<CommandResult> {
  const options = typeof household === 'string' ? { householdId: household } : (household ?? {});
  return runCommand({
    uid,
    envelope: envelope(type, payload, options),
    source: 'test',
    handlers: commandHandlers,
  });
}

async function createHousehold(): Promise<string> {
  const result = success(
    await send(OWNER, 'household.create', { name: '家', timezone: 'Asia/Taipei' }),
    'household.create',
  );
  return (result.data as { householdId: string }).householdId;
}

async function createAnimal(householdId: string, name = ANIMAL.name): Promise<string> {
  const result = success(
    await send(OWNER, 'animal.create', { ...ANIMAL, name }, householdId),
    'animal.create',
  );
  return (result.data as { animalId: string }).animalId;
}

async function createReminder(
  householdId: string,
  animalId: string,
  title: string,
  options: { dueAt?: Date; enabled?: boolean; timezone?: string } = {},
): Promise<string> {
  const timezone = options.timezone ?? 'Asia/Taipei';
  const result = success(
    await send(
      OWNER,
      'reminder.create',
      {
        animalId,
        title,
        type: 'feeding',
        schedule: { kind: 'daily', times: ['08:30'] },
        timezone,
        ...(options.enabled === false ? { enabled: false } : {}),
      },
      householdId,
    ),
    'reminder.create',
  );
  const reminderId = (result.data as { reminderId: string }).reminderId;
  // Pin the occurrence so the bot's "today" window is deterministic.
  await adminDb
    .collection('reminders')
    .doc(reminderId)
    .set(
      {
        nextDueAt: Timestamp.fromDate(options.dueAt ?? new Date()),
        timezone,
        ...(options.enabled === false ? { enabled: false } : {}),
      },
      { merge: true },
    );
  return reminderId;
}

type Setup = { householdId: string; animalId: string; reminderId: string };

async function setup(): Promise<Setup> {
  await seedUser(OWNER);
  const householdId = await createHousehold();
  await adminDb
    .collection('users')
    .doc(OWNER)
    .set({ defaultHouseholdId: householdId }, { merge: true });
  await adminDb.collection('lineUsers').doc(LINE_USER).set({ uid: OWNER });
  const animalId = await createAnimal(householdId);
  const reminderId = await createReminder(householdId, animalId, '餵食');
  return { householdId, animalId, reminderId };
}

async function records(householdId: string): Promise<Array<Record<string, any>>> {
  const snap = await adminDb.collection('records').where('householdId', '==', householdId).get();
  return snap.docs.map((doc) => doc.data());
}

beforeEach(async () => {
  await clearFirestore();
  await clearAuth();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('handleLineEvent identity resolution', () => {
  it('sends a LIFF login link to an unlinked LINE user', async () => {
    await seedUser(OWNER);
    const { replies, gateway } = recorder();

    await handleLineEvent(messageEvent('今日'), gateway);

    expect(replies).toHaveLength(1);
    expect(replies[0]).toContain('liff.line.me');
    // An unlinked user has no UID to attribute a command to, so nothing is charged.
    expect((await adminDb.collection('commands').get()).empty).toBe(true);
    expect((await adminDb.collection('rateLimits').get()).empty).toBe(true);
  });

  it.each(['unlinked', 'deleted'])(
    'rejects a %s LINE mapping without reading or writing household data',
    async (status) => {
      const { householdId } = await setup();
      await adminDb.collection('lineUsers').doc(LINE_USER).set({ uid: OWNER, status });
      const { replies, gateway } = recorder();
      const event = messageEvent('餵食 阿肥');

      await handleLineEvent(event, gateway);

      // The revoked link gets the login link, never the membership reply or data.
      expect(replies).toHaveLength(1);
      expect(replies[0]).toContain('liff.line.me');
      expect(replies[0]).not.toContain('你已不在這個家庭');
      expect(await records(householdId)).toHaveLength(0);
      expect(
        (await adminDb.collection('commands').doc(botCommandId(event.webhookEventId)).get()).exists,
      ).toBe(false);
      // No account was resolved, so the bot budget is untouched.
      expect(await readLimitCount(OWNER, 'bot')).toBeUndefined();
    },
  );

  it('sends a create-household link to a user without a household', async () => {
    await seedUser(OWNER);
    await adminDb.collection('lineUsers').doc(LINE_USER).set({ uid: OWNER });
    const { replies, gateway } = recorder();

    await handleLineEvent(messageEvent('今日'), gateway);

    expect(replies).toHaveLength(1);
    expect(replies[0]).toContain('/settings');
  });

  it('refuses a tombstoned account', async () => {
    const { householdId } = await setup();
    await adminDb
      .collection('users')
      .doc(OWNER)
      .set({ deletedAt: Timestamp.now(), defaultHouseholdId: householdId }, { merge: true });
    const { replies, gateway } = recorder();

    await handleLineEvent(messageEvent('今日'), gateway);

    expect(replies).toEqual(['這個帳號已刪除，請重新註冊。']);
  });

  it('ignores group and room events', async () => {
    const { householdId } = await setup();
    const { replies, gateway } = recorder();
    const event = messageEvent('餵食 阿肥', {
      source: { type: 'group', userId: LINE_USER },
    });

    await handleLineEvent(event, gateway);

    expect(replies).toHaveLength(0);
    expect(
      (await adminDb.collection('commands').doc(botCommandId(event.webhookEventId)).get()).exists,
    ).toBe(false);
    expect(await records(householdId)).toHaveLength(0);
  });

  it('refuses a household the user no longer belongs to', async () => {
    const { householdId, reminderId } = await setup();
    // The reminder title stays private even though `defaultHouseholdId` is stale.
    await adminDb.doc(`households/${householdId}/members/${OWNER}`).delete();
    const { replies, gateway } = recorder();

    await handleLineEvent(messageEvent('今日'), gateway);

    expect(replies).toHaveLength(1);
    expect(replies[0]).toContain('你已不在這個家庭');
    expect(replies.join('\n')).not.toContain('餵食');
    expect((await adminDb.collection('reminders').doc(reminderId).get()).exists).toBe(true);
  });

  it('ignores non-text messages', async () => {
    await setup();
    const { replies, gateway } = recorder();

    await handleLineEvent(messageEvent('', { message: { type: 'sticker' } }), gateway);

    expect(replies).toHaveLength(0);
  });
});

describe('handleLineEvent command dispatch', () => {
  it('summarises today, then reflects a completion', async () => {
    const { reminderId } = await setup();
    const { replies, gateway } = recorder();

    await handleLineEvent(messageEvent('今日'), gateway);
    await handleLineEvent(messageEvent('完成 餵食'), gateway);
    await handleLineEvent(messageEvent('今日'), gateway);

    expect(replies[0]).toBe('今日任務（0/1）：\n○ 餵食');
    expect(replies[1]).toBe('已完成「餵食」。');
    expect(replies[2]).toBe('今日任務（1/1）：\n✓ 餵食');

    const completions = await adminDb.collection('taskCompletions').get();
    expect(completions.size).toBe(1);
    expect(completions.docs[0]?.data().reminderId).toBe(reminderId);
  });

  it('lists the household animals', async () => {
    await setup();
    const { replies, gateway } = recorder();

    await handleLineEvent(messageEvent('居民'), gateway);

    expect(replies).toEqual(['居民：阿肥']);
  });

  it('records feeding with the note', async () => {
    const { householdId, animalId } = await setup();
    const { replies, gateway } = recorder();

    await handleLineEvent(messageEvent('餵食 阿肥 吃了兩隻蟋蟀'), gateway);

    const stored = await records(householdId);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      animalId,
      type: 'feeding',
      note: '吃了兩隻蟋蟀',
      createdBy: OWNER,
      source: 'bot',
    });
    expect(replies).toEqual(['已記錄 阿肥 的餵食。']);
  });

  it('records weight in grams', async () => {
    const { householdId } = await setup();
    const { replies, gateway } = recorder();

    await handleLineEvent(messageEvent('體重 阿肥 68'), gateway);

    const stored = await records(householdId);
    expect(stored[0]).toMatchObject({ type: 'weight', value: 68, unit: 'g' });
    expect(replies).toEqual(['已記錄 阿肥 的體重 68 g。']);
  });

  it('completes a task by title without resolving an animal', async () => {
    const { householdId, animalId, reminderId } = await setup();
    const taskId = await createReminder(householdId, animalId, '換水');
    const { replies, gateway } = recorder();

    await handleLineEvent(messageEvent('完成 換水'), gateway);

    expect(replies).toEqual(['已完成「換水」。']);
    const completions = await adminDb.collection('taskCompletions').get();
    expect(completions.size).toBe(1);
    expect(completions.docs[0]?.data().reminderId).toBe(taskId);
    expect(completions.docs[0]?.data().reminderId).not.toBe(reminderId);
  });

  it('reports an unknown animal and an unknown task', async () => {
    await setup();
    const { replies, gateway } = recorder();

    await handleLineEvent(messageEvent('餵食 小美'), gateway);
    await handleLineEvent(messageEvent('完成 不存在的任務'), gateway);

    expect(replies).toEqual(['找不到居民「小美」。', '找不到任務「不存在的任務」。']);
  });

  it('does not complete an overdue or a disabled occurrence', async () => {
    const { householdId, animalId } = await setup();
    const overdue = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    // Both share the title, so only the due-today + enabled filter can pick one.
    await createReminder(householdId, animalId, '換水', { dueAt: overdue });
    await createReminder(householdId, animalId, '換水', { enabled: false });
    const { replies, gateway } = recorder();

    await handleLineEvent(messageEvent('完成 換水'), gateway);

    expect(replies).toEqual(['找不到任務「換水」。']);
    expect((await adminDb.collection('taskCompletions').get()).empty).toBe(true);
  });

  it('uses the household timezone for today and completion keys', async () => {
    const { householdId, animalId, reminderId } = await setup();
    // 2026-10-24T11:00Z is 2026-10-25 in Kiritimati (UTC+14) but still 10-24
    // in the user's Asia/Taipei, so the two timezones disagree on "today".
    const instant = new Date('2026-10-24T11:00:00Z');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(instant);
    await adminDb
      .collection('households')
      .doc(householdId)
      .set({ timezone: 'Pacific/Kiritimati' }, { merge: true });
    // The setup reminder belongs to another day: it must not appear.
    await adminDb
      .collection('reminders')
      .doc(reminderId)
      .set({ nextDueAt: Timestamp.fromDate(new Date('2026-10-20T00:00:00Z')) }, { merge: true });
    await createReminder(householdId, animalId, '換水', {
      dueAt: instant,
      timezone: 'Pacific/Kiritimati',
    });

    const { replies, gateway } = recorder();
    await handleLineEvent(messageEvent('今日'), gateway);
    await handleLineEvent(messageEvent('完成 換水'), gateway);
    await handleLineEvent(messageEvent('今日'), gateway);

    expect(replies[0]).toBe('今日任務（0/1）：\n○ 換水');
    expect(replies[1]).toBe('已完成「換水」。');
    expect(replies[2]).toBe('今日任務（1/1）：\n✓ 換水');

    const completions = await adminDb.collection('taskCompletions').get();
    expect(completions.size).toBe(1);
    // The key follows the household timezone, which is where 10-25 came from.
    expect(completions.docs[0]?.data().dueDate).toBe('2026-10-25');
  });

  it('creates an invite link the LIFF invite page can read', async () => {
    const { householdId } = await setup();
    const { replies, gateway } = recorder();

    await handleLineEvent(messageEvent('邀請'), gateway);

    expect(replies).toHaveLength(1);
    expect(replies[0]).toContain('/invite?token=');
    const invites = await adminDb
      .collection('invites')
      .where('householdId', '==', householdId)
      .get();
    expect(invites.size).toBe(1);
  });

  it('answers with the help text for unsupported text', async () => {
    await setup();
    const { replies, gateway } = recorder();

    await handleLineEvent(messageEvent('今天天氣如何'), gateway);

    expect(replies).toHaveLength(1);
    expect(replies[0]).toContain('餵食 阿肥');
  });

  it('tells a caretaker that only the owner can invite', async () => {
    const { householdId } = await setup();
    const CARETAKER = 'u_bot_caretaker';
    const CARETAKER_LINE = 'U_bot_caretaker_line';
    await seedUser(CARETAKER);
    const invite = success(
      await send(OWNER, 'member.invite', { role: 'caretaker', expiresInDays: 7 }, householdId),
      'member.invite',
    );
    success(
      await send(CARETAKER, 'member.accept', {
        token: (invite.data as { token: string }).token,
      }),
      'member.accept',
    );
    await adminDb
      .collection('users')
      .doc(CARETAKER)
      .set({ defaultHouseholdId: householdId }, { merge: true });
    await adminDb.collection('lineUsers').doc(CARETAKER_LINE).set({ uid: CARETAKER });

    const { replies, gateway } = recorder();
    await handleLineEvent(
      messageEvent('邀請', { source: { type: 'user', userId: CARETAKER_LINE } }),
      gateway,
    );

    expect(replies).toEqual(['只有家庭擁有者可以邀請成員。']);
  });
});

describe('handleLineEvent idempotency', () => {
  it('ignores a redelivered webhook event before replying', async () => {
    const { householdId } = await setup();
    const { replies, gateway } = recorder();
    const event = messageEvent('餵食 阿肥');

    await handleLineEvent(event, gateway);
    await handleLineEvent(event, gateway);

    expect(replies).toEqual(['已記錄 阿肥 的餵食。']);
    expect(await records(householdId)).toHaveLength(1);
    expect(
      (await adminDb.collection('commands').doc(botCommandId(event.webhookEventId)).get()).exists,
    ).toBe(true);
  });

  it('treats a different event id as a new interaction', async () => {
    await setup();
    const { replies, gateway } = recorder();
    const event = messageEvent('居民');

    await handleLineEvent(event, gateway);
    await handleLineEvent({ ...event, webhookEventId: 'different-event-same-token' }, gateway);

    // Read-only replies keep no idempotency record: only command writes do.
    expect(replies).toHaveLength(2);
  });
});

describe('handleLineEvent rate limits', () => {
  function pinBotBudget(count: number): Promise<unknown> {
    const now = Date.now();
    const windowMs = 60_000;
    return adminDb
      .collection('rateLimits')
      .doc(rateLimitDocId(OWNER, 'bot'))
      .set({
        windowStart: now - (now % windowMs),
        counts: { bot: count },
        expiresAt: Timestamp.fromMillis(now + windowMs),
      });
  }

  it('rate limits read-only replies at 30 bot interactions per minute', async () => {
    await setup();
    await pinBotBudget(30);
    const { replies, gateway } = recorder();

    await handleLineEvent(messageEvent('今日'), gateway);

    expect(replies).toEqual(['操作太頻繁，請稍後再試。']);
  });

  it('rate limits a bot command before dispatch', async () => {
    const { householdId } = await setup();
    await pinBotBudget(30);
    const { replies, gateway } = recorder();

    await handleLineEvent(messageEvent('餵食 阿肥'), gateway);

    expect(replies).toEqual(['操作太頻繁，請稍後再試。']);
    expect(await records(householdId)).toHaveLength(0);
  });

  it('meters an early-exit reply against the same bucket', async () => {
    await setup();
    await pinBotBudget(30);
    const { replies, gateway } = recorder();

    // The animal does not exist, but the attempt still counts as an interaction.
    await handleLineEvent(messageEvent('餵食 不存在的居民'), gateway);

    expect(replies).toEqual(['操作太頻繁，請稍後再試。']);
  });

  it('charges exactly one point per delivery and stops at 30', async () => {
    await setup();
    const { replies, gateway } = recorder();

    await handleLineEvent(messageEvent('餵食 阿肥'), gateway);
    expect(await readLimitCount(OWNER, 'bot')).toBe(1);

    await handleLineEvent(messageEvent('今日'), gateway);
    expect(await readLimitCount(OWNER, 'bot')).toBe(2);

    // One point short of the limit is still allowed; the next one is refused.
    await pinBotBudget(29);
    await handleLineEvent(messageEvent('居民'), gateway);
    expect(await readLimitCount(OWNER, 'bot')).toBe(30);

    await handleLineEvent(messageEvent('居民'), gateway);
    expect(replies.at(-1)).toBe('操作太頻繁，請稍後再試。');
    expect(await readLimitCount(OWNER, 'bot')).toBe(30);
  });
});

describe('handleLineEvent live-animal join', () => {
  it.each(['archived', 'deleted'] as const)(
    'hides today tasks and completion for a %s animal',
    async (state) => {
      const { householdId, animalId } = await setup();
      if (state === 'archived') {
        success(
          await send(OWNER, 'animal.archive', { animalId }, { householdId, baseRevision: 0 }),
          'animal.archive',
        );
      } else {
        success(
          await send(OWNER, 'animal.delete', { animalId }, { householdId, baseRevision: 0 }),
          'animal.delete',
        );
      }

      // Simulate the `cleanupPending` tail: the delete cascade is bounded, so a
      // reminder may stay enabled and un-deleted after its animal is gone.
      const reminder = (
        await adminDb.collection('reminders').where('householdId', '==', householdId).get()
      ).docs[0];
      expect(reminder).toBeDefined();
      await reminder!.ref.set({ enabled: true, deletedAt: null }, { merge: true });

      const { replies, gateway } = recorder();
      await handleLineEvent(messageEvent('今日'), gateway);
      await handleLineEvent(messageEvent('完成 餵食'), gateway);

      expect(replies[0]).toContain('今天沒有任務');
      expect(replies[1]).toBe('找不到任務「餵食」。');
      expect((await adminDb.collection('taskCompletions').get()).empty).toBe(true);
    },
  );
});

describe('handleLineEvent read-only dedupe', () => {
  it('replies once for the same read-only delivery', async () => {
    await setup();
    const { replies, gateway } = recorder();
    const event = messageEvent('居民');

    await handleLineEvent(event, gateway);
    await handleLineEvent(event, gateway);

    expect(replies).toEqual(['居民：阿肥']);
    const marker = await adminDb.collection('lineEvents').doc(String(event.webhookEventId)).get();
    expect(marker.exists).toBe(true);
    expect((marker.data()?.expiresAt as Timestamp).toMillis()).toBeGreaterThan(Date.now());
  });
});
