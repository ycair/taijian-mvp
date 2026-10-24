import { DateTime } from 'luxon';
import type { z } from 'zod';
import type { ScheduleSchema } from '@taijian/domain';

type Schedule = z.infer<typeof ScheduleSchema>;

type Time = string;

/**
 * Schedule times are always interpreted in the reminder's stored timezone, so a
 * client in another timezone (or a user who moves) cannot shift a reminder.
 * Returns `undefined` only when the time is malformed; the payload schema
 * already rejects anything else.
 */
function parseTime(time: Time): { hour: number; minute: number } {
  const [hour, minute] = time.split(':');
  return { hour: Number(hour ?? 0), minute: Number(minute ?? 0) };
}

function atTime(base: DateTime, time: Time): DateTime {
  const { hour, minute } = parseTime(time);
  return base.set({ hour, minute, second: 0, millisecond: 0 });
}

/**
 * The next occurrence strictly after `from`, in UTC. Occurrences are local wall
 * clock times in `timezone`; Luxon resolves a DST gap (spring forward) to the
 * next valid local time instead of skipping the day.
 */
export function computeNextDueAt(schedule: Schedule, timezone: string, from: Date): Date {
  const base = DateTime.fromJSDate(from, { zone: timezone });
  if (!base.isValid) throw new Error(`invalid timezone: ${timezone}`);
  const times = [...schedule.times].sort();

  if (schedule.kind === 'daily') {
    for (const time of times) {
      const candidate = atTime(base, time);
      if (candidate > base) return candidate.toUTC().toJSDate();
    }
    return atTime(base.plus({ days: 1 }), times[0] ?? '08:00')
      .toUTC()
      .toJSDate();
  }

  if (schedule.kind === 'weekly') {
    for (let offset = 0; offset <= 7; offset += 1) {
      const day = base.plus({ days: offset });
      if (!schedule.weekdays.includes(day.weekday)) continue;
      for (const time of times) {
        const candidate = atTime(day, time);
        if (candidate > base) return candidate.toUTC().toJSDate();
      }
    }
    throw new Error('weekly schedule produced no next occurrence');
  }

  // Interval schedules are anchored to `startDate`, counted in local days.
  const start = DateTime.fromISO(schedule.startDate, { zone: timezone }).startOf('day');
  const today = base.startOf('day');
  // A future start date wins: the first occurrence is never before it.
  const firstDay = start > today ? start : today;
  const daysSinceStart = Math.max(0, Math.floor(firstDay.diff(start, 'days').days));
  const remainder = daysSinceStart % schedule.everyNDays;
  const dayOffset = remainder === 0 ? 0 : schedule.everyNDays - remainder;

  // Only aligned days matter; at most two of them can hold a future time.
  for (let occurrence = 0; occurrence < 2; occurrence += 1) {
    const day = firstDay.plus({
      days: dayOffset + occurrence * schedule.everyNDays,
    });
    for (const time of times) {
      const candidate = atTime(day, time);
      if (candidate > base) return candidate.toUTC().toJSDate();
    }
  }
  throw new Error('interval schedule produced no next occurrence');
}
