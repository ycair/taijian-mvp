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
  dueDate: string;
  dueAt: Date;
  overdue: boolean;
  completedBy?: string;
};

function toDate(value: ReminderLike['nextDueAt']): Date {
  return value instanceof Date ? value : value.toDate();
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
        dueDate,
        dueAt,
        overdue: dueAt.getTime() < now.getTime(),
        ...(completion?.completedBy ? { completedBy: completion.completedBy } : {}),
      } satisfies TodayTask;
    })
    .filter((task): task is TodayTask => task !== null)
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.dueAt.getTime() - b.dueAt.getTime());
}
