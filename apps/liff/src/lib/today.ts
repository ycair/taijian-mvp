import { localDateKey } from '@taijian/domain';

export type ReminderLike = {
  id: string;
  animalId: string;
  title: string;
  timezone: string;
  nextDueAt: Date | { toDate: () => Date };
  enabled: boolean;
  deletedAt?: unknown;
};
export type CompletionLike = {
  reminderId: string;
  dueDate: string;
  completedBy?: string;
};
export type AnimalLike = {
  id: string;
  name: string;
  avatarColor: string;
  species: string;
};
export type TodayTask = {
  reminderId: string;
  animalId: string;
  animalName: string;
  title: string;
  timezone: string;
  dueDate: string;
  dueAt: Date;
  overdue: boolean;
  completedBy?: string;
};

function toDate(value: ReminderLike['nextDueAt']): Date {
  return value instanceof Date ? value : value.toDate();
}

/** Shifts a `YYYY-MM-DD` key by whole days without touching the host timezone. */
export function shiftDateKey(dateKey: string, days: number): string {
  const [year = 1970, month = 1, day = 1] = dateKey.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day));
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/**
 * The completions window the Today page reads: yesterday → tomorrow in the
 * household's timezone. Wide enough for late writes and clock skew, bounded so
 * the listener never grows with household history.
 */
export function taskCompletionWindow(
  now: Date,
  timezone: string,
): { today: string; from: string; to: string } {
  const today = localDateKey(now, timezone);
  return { today, from: shiftDateKey(today, -1), to: shiftDateKey(today, 1) };
}

export function buildTodayTasks(
  reminders: ReminderLike[],
  completions: CompletionLike[],
  animals: AnimalLike[],
  now: Date,
): TodayTask[] {
  const animalById = new Map(animals.map((animal) => [animal.id, animal]));
  const completionByKey = new Map(
    completions.map((completion) => [
      `${completion.reminderId}:${completion.dueDate}`,
      completion,
    ]),
  );

  return reminders
    .filter((reminder) => reminder.enabled && !reminder.deletedAt)
    .map((reminder) => {
      const dueAt = toDate(reminder.nextDueAt);
      const dueDate = localDateKey(dueAt, reminder.timezone);
      const today = localDateKey(now, reminder.timezone);
      if (dueDate !== today) return null;
      const animal = animalById.get(reminder.animalId);
      const completion = completionByKey.get(`${reminder.id}:${dueDate}`);
      return {
        reminderId: reminder.id,
        animalId: reminder.animalId,
        animalName: animal?.name ?? '未命名居民',
        title: reminder.title,
        timezone: reminder.timezone,
        dueDate,
        dueAt,
        overdue: dueAt.getTime() < now.getTime(),
        ...(completion?.completedBy ? { completedBy: completion.completedBy } : {}),
      } satisfies TodayTask;
    })
    .filter((task): task is TodayTask => task !== null)
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.dueAt.getTime() - b.dueAt.getTime());
}
