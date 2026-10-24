import { createHash, randomUUID } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import {
  AppError,
  localDateKey,
  type CommandFailure,
  type CommandResult,
  type CommandType,
} from '@taijian/domain';
import { commandHandlers } from '../commands/registry';
import { runCommand } from '../commands/runCommand';
import { config } from '../config';
import { db } from '../lib/firestore';
import { botRateLimitRules, consumeRateLimits } from '../lib/rateLimit';
import { toFailure } from '../lib/result';
import { parseBotCommand } from './commands';
import { LineGateway } from './gateway';

/** The subset of a Messaging API webhook event this bot reads. */
export type LineWebhookEvent = {
  type: string;
  webhookEventId: string;
  replyToken?: string;
  source?: { type?: string; userId?: string };
  message?: { type: string; text?: string };
};

/** The only gateway behaviour the handler needs; tests pass a recorder. */
export type ReplyGateway = Pick<LineGateway, 'reply'>;

/** Bot commands are attributed to the bot, never to a client app version. */
const BOT_APP_VERSION = '1.0.0';
const DEFAULT_TIMEZONE = 'Asia/Taipei';

const HELP_TEXT = [
  '我可以幫你記錄照顧。',
  '・今日：今天的任務',
  '・居民：家裡有哪些動物',
  '・餵食 阿肥 吃了兩隻蟋蟀',
  '・體重 阿肥 68',
  '・完成 換水',
  '・邀請：產生家人邀請連結',
].join('\n');

const RATE_LIMITED_TEXT = '操作太頻繁，請稍後再試。';

/** LINE rejects text messages longer than this many characters. */
const LINE_TEXT_LIMIT = 5_000;

/**
 * Keeps every reply within LINE's text limit. The cut never lands between the
 * halves of a surrogate pair, so an emoji at the boundary stays intact.
 */
export function truncateReplyText(text: string): string {
  if (text.length <= LINE_TEXT_LIMIT) return text;
  let cut = text.slice(0, LINE_TEXT_LIMIT - 1);
  if (/[\ud800-\udbff]$/.test(cut)) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/**
 * LINE's `webhookEventId` is a ULID, but every command envelope requires a
 * UUID. Hashing the event id keeps one webhook delivery mapped to exactly one
 * command document, so the `commands/{commandId}` replay check still ignores
 * redeliveries.
 */
export function botCommandId(webhookEventId: string): string {
  const digest = createHash('sha1').update(`line:webhook:${webhookEventId}`).digest('hex');
  const variant = ((Number.parseInt(digest.slice(16, 18), 16) & 0x3f) | 0x80)
    .toString(16)
    .padStart(2, '0');
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `5${digest.slice(13, 16)}`,
    `${variant}${digest.slice(18, 20)}`,
    digest.slice(20, 32),
  ].join('-');
}

function liffUrl(path: string): string {
  return `https://liff.line.me/${config.LIFF_ID}${path}`;
}

/** Failure codes reach the user in Traditional Chinese, never as LINE English. */
function failureText(result: CommandFailure): string {
  switch (result.code) {
    case 'RATE_LIMITED':
      return RATE_LIMITED_TEXT;
    case 'FORBIDDEN':
      return '你在這個家庭沒有這個權限。';
    case 'NOT_FOUND':
      return '找不到資料，請到 LIFF 確認後再試。';
    case 'CONFLICT':
      return '資料剛被其他人更新，請重新整理後再試。';
    case 'VALIDATION_ERROR':
      return '指令格式不正確，輸入「說明」可以看到可用指令。';
    case 'UNAUTHENTICATED':
      return '登入已失效，請重新透過 LIFF 登入。';
    case 'IDEMPOTENCY_MISMATCH':
      return '這個操作重複了，請重新操作。';
    case 'DUPLICATE_ID':
      return '資料重複，請重新操作。';
    default:
      return '系統暫時無法處理，請稍後再試。';
  }
}

async function reply(gateway: ReplyGateway, event: LineWebhookEvent, text: string): Promise<void> {
  if (!event.replyToken) return;
  await gateway.reply(event.replyToken, [{ type: 'text', text: truncateReplyText(text) }]);
}

/** Runs a command for the bot and turns thrown errors into a reply-ready result. */
async function runBotCommand(
  uid: string,
  commandId: string,
  type: CommandType,
  householdId: string,
  payload: unknown,
): Promise<CommandResult> {
  try {
    return await runCommand({
      uid,
      envelope: {
        commandId,
        type,
        householdId,
        payload,
        client: { platform: 'bot', appVersion: BOT_APP_VERSION },
      },
      source: 'bot',
      handlers: commandHandlers,
    });
  } catch (error) {
    return toFailure(error, commandId);
  }
}

type ReminderDoc = {
  title?: string;
  timezone?: string;
  nextDueAt?: Timestamp;
  enabled?: boolean;
  deletedAt?: unknown;
};

type TaskSummary = { done: number; total: number; lines: string[] };

/**
 * Today's due tasks for this household. The household timezone defines "today"
 * (and therefore the completion keys), while each reminder's own stored
 * timezone decides which calendar day its `nextDueAt` belongs to.
 */
async function taskSummary(householdId: string, householdTimezone: string): Promise<TaskSummary> {
  const today = localDateKey(new Date(), householdTimezone);
  const [reminders, completions] = await Promise.all([
    db
      .collection('reminders')
      .where('householdId', '==', householdId)
      .where('enabled', '==', true)
      .get(),
    db
      .collection('taskCompletions')
      .where('householdId', '==', householdId)
      .where('dueDate', '==', today)
      .get(),
  ]);

  const completed = new Set(completions.docs.map((doc) => String(doc.data().reminderId)));
  const due = reminders.docs
    .filter((doc) => doc.data().deletedAt == null)
    .map((doc) => ({ id: doc.id, data: doc.data() as ReminderDoc }))
    .filter(({ data }) => data.nextDueAt instanceof Timestamp)
    .filter(
      ({ data }) =>
        localDateKey((data.nextDueAt as Timestamp).toDate(), data.timezone ?? householdTimezone) ===
        today,
    );

  return {
    done: due.filter(({ id }) => completed.has(id)).length,
    total: due.length,
    lines: due.map(
      ({ id, data }) => `${completed.has(id) ? '✓' : '○'} ${data.title ?? '（未命名任務）'}`,
    ),
  };
}

type AnimalDoc = {
  name?: string;
  status?: string;
  deletedAt?: unknown;
};

/** Picks one animal by name: an exact hit wins, otherwise a unique substring. */
async function resolveAnimal(
  householdId: string,
  animalName: string,
): Promise<{ animalId: string; name: string } | 'none' | 'many'> {
  const snap = await db.collection('animals').where('householdId', '==', householdId).get();
  const query = animalName.trim().toLowerCase();
  const active = snap.docs
    .map((doc) => ({ id: doc.id, data: doc.data() as AnimalDoc }))
    .filter(({ data }) => data.deletedAt == null && data.status === 'active')
    .map(({ id, data }) => ({ animalId: id, name: String(data.name ?? '') }));

  const exact = active.filter((animal) => animal.name.toLowerCase() === query);
  const matches =
    exact.length > 0 ? exact : active.filter((animal) => animal.name.toLowerCase().includes(query));

  if (matches.length === 0) return 'none';
  if (matches.length > 1) return 'many';
  return matches[0]!;
}

/**
 * Charges one bot interaction. Every attributable delivery consumes a point,
 * whether it writes, only reads, or exits early with a "not found" reply.
 */
async function botBudgetExceeded(uid: string): Promise<boolean> {
  try {
    await consumeRateLimits(uid, botRateLimitRules());
    return false;
  } catch (error) {
    if (error instanceof AppError && error.code === 'RATE_LIMITED') return true;
    throw error;
  }
}

type UserDoc = {
  defaultHouseholdId?: string;
  householdIds?: string[];
  timezone?: string;
  deletedAt?: unknown;
};

/**
 * Handles one verified Messaging API event. The `commands/{commandId}` check
 * runs before any reply so a redelivered webhook stays silent.
 */
export async function handleLineEvent(
  event: LineWebhookEvent,
  gateway: ReplyGateway = new LineGateway(),
): Promise<void> {
  if (event.type !== 'message' || event.message?.type !== 'text') return;
  // v1 is 1:1 chat only: group and room events never see household data.
  if (event.source?.type !== undefined && event.source.type !== 'user') return;

  const lineUserId = event.source?.userId;
  if (!lineUserId) return;

  const commandId = event.webhookEventId ? botCommandId(event.webhookEventId) : randomUUID();

  // Command writes leave a `commands/{commandId}` record, so a redelivery is
  // skipped here. Read-only replies write nothing: a duplicate delivery of one
  // of those is only stopped by LINE's single-use reply token, which is why no
  // extra marker collection is introduced this round.
  const processed = await db.collection('commands').doc(commandId).get();
  if (processed.exists) return;

  const mapping = await db.collection('lineUsers').doc(lineUserId).get();
  const mappingData = mapping.data() as { uid?: string; status?: string } | undefined;
  const uid = mappingData?.uid;
  // A revoked mapping (unlink / account deletion) keeps its UID for audit, so
  // the status decides whether this LINE account may still act.
  if (!uid || (mappingData?.status ?? 'active') !== 'active') {
    await reply(gateway, event, `請先透過 LIFF 登入苔間：${liffUrl('/')}`);
    return;
  }

  const userSnap = await db.collection('users').doc(uid).get();
  const user = userSnap.data() as UserDoc | undefined;
  if (user?.deletedAt != null) {
    await reply(gateway, event, '這個帳號已刪除，請重新註冊。');
    return;
  }

  // One point per attributable interaction, charged before any household
  // resolution so that early-exit replies ("no household", "not a member",
  // "animal not found", ambiguous names, unknown tasks) are metered too.
  if (await botBudgetExceeded(uid)) {
    await reply(gateway, event, RATE_LIMITED_TEXT);
    return;
  }

  const householdId = user?.defaultHouseholdId ?? user?.householdIds?.[0];
  if (!householdId) {
    await reply(gateway, event, `請先建立家庭：${liffUrl('/settings')}`);
    return;
  }

  // The bot reads with admin credentials, so the rules cannot protect it: a
  // stale `defaultHouseholdId` must not expose a household the user left.
  const membership = await db.doc(`households/${householdId}/members/${uid}`).get();
  if (!membership.exists) {
    await reply(gateway, event, `你已不在這個家庭，請到 LIFF 重新選擇：${liffUrl('/settings')}`);
    return;
  }

  // The household timezone, not the user's, defines "today" for task keys; the
  // user timezone is only a fallback for a household document without one.
  const householdSnap = await db.collection('households').doc(householdId).get();
  const householdTimezone =
    (householdSnap.data()?.timezone as string | undefined) ?? user?.timezone ?? DEFAULT_TIMEZONE;

  const command = parseBotCommand(event.message.text ?? '');

  if (command.kind === 'help' || command.kind === 'unknown') {
    await reply(gateway, event, HELP_TEXT);
    return;
  }

  if (command.kind === 'today') {
    const summary = await taskSummary(householdId, householdTimezone);
    await reply(
      gateway,
      event,
      summary.total === 0
        ? `今天沒有任務。到 LIFF 新增提醒：${liffUrl('/settings')}`
        : `今日任務（${summary.done}/${summary.total}）：\n${summary.lines.join('\n')}`,
    );
    return;
  }

  if (command.kind === 'animals') {
    const snap = await db.collection('animals').where('householdId', '==', householdId).get();
    const names = snap.docs
      .map((doc) => doc.data() as AnimalDoc)
      .filter((animal) => animal.deletedAt == null && animal.status === 'active')
      .map((animal) => animal.name)
      .filter((name): name is string => Boolean(name));
    await reply(
      gateway,
      event,
      names.length > 0
        ? `居民：${names.join('、')}`
        : `還沒有居民，先到 LIFF 新增：${liffUrl('/animals')}`,
    );
    return;
  }

  if (command.kind === 'invite') {
    const result = await runBotCommand(uid, commandId, 'member.invite', householdId, {
      role: 'caretaker',
      expiresInDays: 7,
    });
    if (!result.ok) {
      await reply(
        gateway,
        event,
        result.code === 'FORBIDDEN' ? '只有家庭擁有者可以邀請成員。' : failureText(result),
      );
      return;
    }
    const token = (result.data as { token?: string }).token;
    await reply(
      gateway,
      event,
      token
        ? `邀請連結（7 天內有效，限用一次）：${liffUrl(`/invite?token=${encodeURIComponent(token)}`)}`
        : '邀請已建立，請到 LIFF 取得連結。',
    );
    return;
  }

  // 完成 is resolved against reminders, never against animals, and only for an
  // occurrence that is actually due today in the household timezone.
  if (command.kind === 'complete') {
    const today = localDateKey(new Date(), householdTimezone);
    const snap = await db.collection('reminders').where('householdId', '==', householdId).get();
    const query = command.taskName.trim().toLowerCase();
    const reminders = snap.docs
      .map((doc) => ({ id: doc.id, data: doc.data() as ReminderDoc }))
      .filter(
        ({ data }) =>
          data.enabled === true && data.deletedAt == null && data.nextDueAt instanceof Timestamp,
      )
      .filter(
        ({ data }) =>
          localDateKey(
            (data.nextDueAt as Timestamp).toDate(),
            data.timezone ?? householdTimezone,
          ) === today,
      )
      .map((reminder) => ({ ...reminder, title: reminder.data.title ?? '' }));
    const exact = reminders.filter((reminder) => reminder.title.toLowerCase() === query);
    const matches =
      exact.length > 0
        ? exact
        : reminders.filter((reminder) => reminder.title.toLowerCase().includes(query));

    if (matches.length === 0) {
      await reply(gateway, event, `找不到任務「${command.taskName}」。`);
      return;
    }
    if (matches.length > 1) {
      await reply(
        gateway,
        event,
        `有多個任務符合「${command.taskName}」，請到 LIFF 完成：${liffUrl('/')}`,
      );
      return;
    }

    const task = matches[0]!;
    const result = await runBotCommand(uid, commandId, 'task.complete', householdId, {
      reminderId: task.id,
      dueDate: today,
    });
    if (!result.ok) {
      await reply(gateway, event, failureText(result));
      return;
    }
    const alreadyCompleted = (result.data as { alreadyCompleted?: boolean }).alreadyCompleted;
    const title = task.data.title ?? command.taskName;
    await reply(
      gateway,
      event,
      alreadyCompleted ? `「${title}」今天已經完成了。` : `已完成「${title}」。`,
    );
    return;
  }

  const animal = await resolveAnimal(householdId, command.animalName);
  if (animal === 'none') {
    await reply(gateway, event, `找不到居民「${command.animalName}」。`);
    return;
  }
  if (animal === 'many') {
    await reply(
      gateway,
      event,
      `有多位居民符合「${command.animalName}」，請到 LIFF 選擇：${liffUrl('/animals')}`,
    );
    return;
  }

  const occurredAt = new Date().toISOString();
  const payload =
    command.kind === 'weight'
      ? { animalId: animal.animalId, type: 'weight', occurredAt, value: command.grams, unit: 'g' }
      : {
          animalId: animal.animalId,
          type: 'feeding',
          occurredAt,
          ...(command.kind === 'feed' && command.note ? { note: command.note } : {}),
        };

  const result = await runBotCommand(uid, commandId, 'record.create', householdId, payload);
  await reply(
    gateway,
    event,
    result.ok
      ? command.kind === 'weight'
        ? `已記錄 ${animal.name} 的體重 ${command.grams} g。`
        : `已記錄 ${animal.name} 的餵食。`
      : failureText(result),
  );
}
