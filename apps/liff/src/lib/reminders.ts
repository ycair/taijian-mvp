export type ReminderSchedule =
  | { kind: 'daily'; times: string[] }
  | { kind: 'weekly'; times: string[]; weekdays: number[] }
  | { kind: 'interval'; times: string[]; everyNDays: number; startDate: string };

export type ReminderRecord = {
  id: string;
  animalId: string;
  title: string;
  type: string;
  schedule: ReminderSchedule;
  timezone: string;
  enabled: boolean;
  revision: number;
  deletedAt?: unknown;
  nextDueAt?: unknown;
};

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

export function weekdayLabel(day: number): string {
  return WEEKDAY_LABELS[day - 1] ?? String(day);
}

/** Short human summary of a stored schedule (`每日 08:30`). */
export function scheduleSummary(schedule: unknown): string {
  if (!schedule || typeof schedule !== 'object') return '';
  const value = schedule as Partial<ReminderSchedule> & {
    weekdays?: unknown;
    everyNDays?: unknown;
  };
  const time = Array.isArray(value.times) ? (value.times[0] ?? '') : '';
  if (value.kind === 'daily') return `每日 ${time}`.trim();
  if (value.kind === 'weekly') {
    const days = Array.isArray(value.weekdays)
      ? value.weekdays.map((day) => weekdayLabel(Number(day))).join('、')
      : '';
    return `每週${days} ${time}`.trim();
  }
  if (value.kind === 'interval') {
    return `每 ${Number(value.everyNDays ?? 1)} 天 ${time}`.trim();
  }
  return '';
}
