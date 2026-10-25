import type { Animal, Completion, Reminder } from './types';

export type TodayTask = {
  reminderId: string;
  animalId: string;
  animalName: string;
  title: string;
  dueDate: string;
  dueAt: Date;
  overdue: boolean;
  completedByName?: string;
};

export function dateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function buildTodayTasks(
  reminders: Reminder[],
  completions: Completion[],
  animals: Animal[],
  now: Date,
  householdTimezone: string,
): TodayTask[] {
  const animalById = new Map(animals.filter((a) => a.status === 'active').map((a) => [a.id, a]));
  const completionByKey = new Map(
    completions.map((c) => [`${c.reminder_id}:${c.due_date}`, c]),
  );

  return reminders
    .filter((reminder) => reminder.enabled)
    .map((reminder) => {
      const animal = animalById.get(reminder.animal_id);
      if (!animal) return null;
      const timezone = reminder.timezone || householdTimezone;
      const today = dateKey(now, timezone);
      const schedule = reminder.schedule;
      if (schedule.kind === 'weekly' && schedule.weekdays?.length) {
        const weekday = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' })
          .format(now)
          .slice(0, 3);
        const map: Record<string, number> = { Sun: 7, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
        if (!schedule.weekdays.includes(map[weekday] ?? 0)) return null;
      }
      const time = schedule.times?.[0] ?? '08:00';
      const dueAt = new Date(`${today}T${time}:00`);
      const completion = completionByKey.get(`${reminder.id}:${today}`);
      return {
        reminderId: reminder.id,
        animalId: reminder.animal_id,
        animalName: animal.name,
        title: reminder.title,
        dueDate: today,
        dueAt,
        overdue: dueAt.getTime() < now.getTime(),
        ...(completion?.completed_by_name ? { completedByName: completion.completed_by_name } : {}),
      } satisfies TodayTask;
    })
    .filter((task): task is TodayTask => task !== null)
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.dueAt.getTime() - b.dueAt.getTime());
}
