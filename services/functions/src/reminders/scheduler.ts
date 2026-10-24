import { Timestamp } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { DateTime } from 'luxon';
import { localDateKey, type ScheduleSchema } from '@taijian/domain';
import type { z } from 'zod';
import { config } from '../config';
import { db } from '../lib/firestore';
import { completionId } from '../lib/ids';
import { computeNextDueAt } from '../lib/schedule';
import { LineGateway } from '../line/gateway';

/** Delivery history is kept for 30 days, then collected by the `notificationLog` TTL policy. */
const NOTIFICATION_TTL_MS = 30 * 86_400_000;
/** One scheduler tick handles at most this many due reminders, leaving headroom under the timeout. */
const BATCH_LIMIT = 100;
const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

type Schedule = z.infer<typeof ScheduleSchema>;

export type QuietHours = { start?: string; end?: string } | null | undefined;

type HouseholdSettings = {
  notificationsEnabled?: boolean;
  quietHours?: QuietHours;
};

type HouseholdDoc = {
  timezone?: string;
  settings?: HouseholdSettings | null;
};

type ReminderDoc = {
  householdId?: string;
  animalId?: string;
  title?: string;
  schedule?: Schedule;
  timezone?: string;
  nextDueAt?: Timestamp;
  deletedAt?: unknown;
};

type AnimalDoc = {
  householdId?: string;
  status?: string;
  deletedAt?: unknown;
};

/** Only the push call is needed, so tests can pass a fake instead of the real gateway. */
export type ReminderPusher = {
  push(to: string, messages: Array<{ type: 'text'; text: string }>): Promise<void>;
};

export type ReminderSchedulerSummary = {
  due: number;
  notified: number;
  skipped: number;
  retired: number;
};

type Outcome = 'notified' | 'skipped' | 'retired';

/**
 * `notificationLog` is keyed by reminder, local due date, and channel, so a
 * retried or overlapping scheduler run can never deliver the same occurrence
 * twice.
 */
export function notificationKey(reminderId: string, dueDate: string, channel: string): string {
  return `${reminderId}_${dueDate}_${channel}`;
}

/** Minutes since local midnight, or `undefined` when the stored clock time is malformed. */
function minutesOfClock(clock: string | undefined): number | undefined {
  if (clock === undefined || !CLOCK_TIME.test(clock)) return undefined;
  const [hour = '0', minute = '0'] = clock.split(':');
  return Number(hour) * 60 + Number(minute);
}

/**
 * Quiet hours are local wall-clock times in the household timezone and may wrap
 * past midnight (22:00–07:00). When the window matches, the caller leaves
 * `nextDueAt` untouched so the reminder is delivered as soon as the window
 * closes. A malformed or zero-length window never suppresses a notification:
 * sending is the safer failure for a care reminder.
 */
export function isWithinQuietHours(quietHours: QuietHours, now: Date, timezone: string): boolean {
  const start = minutesOfClock(quietHours?.start);
  const end = minutesOfClock(quietHours?.end);
  if (start === undefined || end === undefined || start === end) return false;

  const local = DateTime.fromJSDate(now, { zone: timezone });
  if (!local.isValid) return false;
  const minute = local.hour * 60 + local.minute;

  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

/** A missing setting means notifications are on; only an explicit `false` opts out. */
export function notificationsEnabled(settings: HouseholdSettings | null | undefined): boolean {
  return settings?.notificationsEnabled !== false;
}

async function loadHousehold(
  householdId: string,
  cache: Map<string, HouseholdDoc | null>,
): Promise<HouseholdDoc | null> {
  const cached = cache.get(householdId);
  if (cached !== undefined) return cached;
  const snap = await db.collection('households').doc(householdId).get();
  const household = snap.exists ? (snap.data() as HouseholdDoc) : null;
  cache.set(householdId, household);
  return household;
}

/**
 * A reminder for a deleted, archived, or memorial resident must never notify;
 * the delete cascade can leave a tail behind (`cleanupPending`), so the
 * scheduler checks the animal itself rather than trusting the reminder.
 */
async function isLiveAnimal(
  animalId: string | undefined,
  householdId: string,
  cache: Map<string, boolean>,
): Promise<boolean> {
  if (!animalId) return false;
  const cached = cache.get(animalId);
  if (cached !== undefined) return cached;

  const snap = await db.collection('animals').doc(animalId).get();
  const animal = snap.exists ? (snap.data() as AnimalDoc) : undefined;
  const live =
    animal !== undefined &&
    animal.householdId === householdId &&
    animal.deletedAt == null &&
    (animal.status ?? 'active') === 'active';
  cache.set(animalId, live);
  return live;
}

/**
 * LINE ids that may receive a push: active household members whose own mapping
 * is still `active`. Unlinked and deleted mappings are tombstones and stay
 * silent.
 */
async function activeLineRecipients(householdId: string): Promise<string[]> {
  const members = await db.collection(`households/${householdId}/members`).get();
  const recipients = new Set<string>();

  for (const member of members.docs) {
    const memberStatus = (member.data() as { status?: string }).status ?? 'active';
    if (memberStatus !== 'active') continue;

    const mappings = await db.collection('lineUsers').where('uid', '==', member.id).get();
    for (const mapping of mappings.docs) {
      // Mappings created before the tombstone field existed have no status and
      // are live, matching `auth/users.ts` and the bot.
      if (((mapping.data() as { status?: string }).status ?? 'active') !== 'active') continue;
      recipients.add(mapping.id);
    }
  }

  return [...recipients];
}

/**
 * Claims an occurrence before any push goes out. `create` fails atomically when
 * another run already wrote the key, which is what makes a crashed or
 * overlapping run at-most-once instead of a duplicate notification.
 */
async function claimNotification(
  key: string,
  data: Record<string, unknown>,
): Promise<FirebaseFirestore.DocumentReference | null> {
  const ref = db.collection('notificationLog').doc(key);
  try {
    await ref.create({ ...data, status: 'pending' });
    return ref;
  } catch (error) {
    // gRPC code 6 is ALREADY_EXISTS: the occurrence belongs to another run.
    if ((error as { code?: unknown }).code === 6) return null;
    throw error;
  }
}

function reminderText(title: string, animalId: string): string {
  return `提醒：${title}\n${config.APP_BASE_URL}/animals/${animalId}`;
}

/**
 * Processes one due reminder. Returns `retired` when the reminder can never
 * notify again (deleted, orphaned, or invalid), `skipped` when this occurrence
 * was handled without a push, and `notified` when at least one push succeeded.
 */
async function processReminder(
  reminderDoc: FirebaseFirestore.QueryDocumentSnapshot,
  now: Date,
  gateway: ReminderPusher,
  households: Map<string, HouseholdDoc | null>,
  animals: Map<string, boolean>,
): Promise<Outcome> {
  const reminder = reminderDoc.data() as ReminderDoc;

  // A cascade delete leaves `enabled: true` on the tail it could not reach.
  const retire = async (): Promise<Outcome> => {
    await reminderDoc.ref.set({ enabled: false }, { merge: true });
    return 'retired';
  };

  if (reminder.deletedAt != null) return retire();

  const { householdId, schedule, timezone } = reminder;
  const storedDueAt = reminder.nextDueAt;
  if (!householdId || !schedule || !timezone || !(storedDueAt instanceof Timestamp)) {
    return retire();
  }

  // A malformed schedule can never be advanced, so retire it instead of
  // re-querying the same reminder on every tick.
  let nextDueAt: Date;
  try {
    nextDueAt = computeNextDueAt(schedule, timezone, now);
  } catch {
    return retire();
  }

  if (!(await isLiveAnimal(reminder.animalId, householdId, animals))) return retire();

  const dueDate = localDateKey(storedDueAt.toDate(), timezone);

  const advance = async (lastCompletedAt?: unknown): Promise<Outcome> => {
    await reminderDoc.ref.set(
      {
        nextDueAt: Timestamp.fromDate(nextDueAt),
        // Deferred from Task 8: the scheduler is what first sees a completion,
        // so it stamps the reminder with the completion time it observed.
        ...(lastCompletedAt instanceof Timestamp ? { lastCompletedAt } : {}),
      },
      { merge: true },
    );
    return 'skipped';
  };

  // A completion is keyed by reminder + due date, so an already-done
  // occurrence is silent no matter who completed it.
  const completion = await db
    .collection('taskCompletions')
    .doc(completionId(reminderDoc.id, dueDate))
    .get();
  if (completion.exists) return advance(completion.data()?.completedAt);

  const household = await loadHousehold(householdId, households);
  if (!household) return advance();
  if (!notificationsEnabled(household.settings)) return advance();

  // Quiet hours leave `nextDueAt` untouched on purpose: the reminder fires as
  // soon as the window closes instead of being skipped for the whole day.
  if (isWithinQuietHours(household.settings?.quietHours, now, household.timezone ?? timezone)) {
    return 'skipped';
  }

  const key = notificationKey(reminderDoc.id, dueDate, 'line');
  const logRef = await claimNotification(key, {
    householdId,
    reminderId: reminderDoc.id,
    animalId: reminder.animalId ?? null,
    dueDate,
    channel: 'line',
    createdAt: Timestamp.fromDate(now),
    expiresAt: Timestamp.fromMillis(now.getTime() + NOTIFICATION_TTL_MS),
  });
  // Another run claimed this occurrence; advancing keeps it out of the next query.
  if (!logRef) return advance();

  const recipients = await activeLineRecipients(householdId);
  const text = reminderText(reminder.title ?? '', reminder.animalId ?? '');
  let delivered = 0;
  let failed = 0;

  for (const lineUserId of recipients) {
    try {
      await gateway.push(lineUserId, [{ type: 'text', text }]);
      delivered += 1;
    } catch (error) {
      failed += 1;
      console.error('LINE push failed', {
        reminderId: reminderDoc.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await logRef.set(
    {
      status:
        delivered > 0 ? (failed > 0 ? 'partial' : 'sent') : failed > 0 ? 'failed' : 'no_recipients',
      delivered,
      failed,
    },
    { merge: true },
  );

  // Delivery problems are recorded, never rolled back into the reminder: the
  // task still happened and the next occurrence must still be scheduled.
  await reminderDoc.ref.set({ nextDueAt: Timestamp.fromDate(nextDueAt) }, { merge: true });
  return delivered > 0 ? 'notified' : 'skipped';
}

/**
 * One scheduler pass. Exported so the emulator suite can drive it with a fixed
 * clock and a fake LINE gateway; production calls it through `reminderScheduler`.
 */
export async function runReminderScheduler(
  options: { now?: Date; gateway?: ReminderPusher } = {},
): Promise<ReminderSchedulerSummary> {
  const now = options.now ?? new Date();
  const gateway = options.gateway ?? new LineGateway();

  const due = await db
    .collection('reminders')
    .where('enabled', '==', true)
    .where('nextDueAt', '<=', Timestamp.fromDate(now))
    .limit(BATCH_LIMIT)
    .get();

  const summary: ReminderSchedulerSummary = {
    due: due.size,
    notified: 0,
    skipped: 0,
    retired: 0,
  };
  const households = new Map<string, HouseholdDoc | null>();
  const animals = new Map<string, boolean>();

  for (const reminderDoc of due.docs) {
    try {
      const outcome = await processReminder(reminderDoc, now, gateway, households, animals);
      summary[outcome] += 1;
    } catch (error) {
      // One bad document must not block the rest of the batch; the next tick retries it.
      summary.skipped += 1;
      console.error('reminder processing failed', {
        reminderId: reminderDoc.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return summary;
}

export const reminderScheduler = onSchedule(
  {
    region: 'asia-east1',
    schedule: 'every 5 minutes',
    timeZone: 'Asia/Taipei',
    // A full 100-reminder batch can exceed the 60s default when LINE is slow;
    // a longer timeout lets the run finish instead of being killed mid-batch.
    timeoutSeconds: 120,
  },
  async () => {
    await runReminderScheduler();
  },
);
