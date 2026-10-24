import { z } from 'zod';
import { TimezoneSchema } from './household';

const TimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/**
 * v1 treats one reminder occurrence per local *day*: `notificationLog` is keyed
 * by due date (`reminderId_dueDate_line`) and `taskCompletions` by
 * `completionId(reminderId, dueDate)`. A second time of day would share both
 * keys with the first and silently lose its notification/completion, so the
 * schema only allows exactly one time until occurrence-based keys land in v2.
 */
const ScheduleTimesSchema = z.array(TimeSchema).length(1);

export const ScheduleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('daily'), times: ScheduleTimesSchema }),
  z.object({
    kind: z.literal('weekly'),
    times: ScheduleTimesSchema,
    weekdays: z.array(z.number().int().min(1).max(7)).min(1),
  }),
  z.object({
    kind: z.literal('interval'),
    times: ScheduleTimesSchema,
    everyNDays: z.number().int().min(1).max(365),
    startDate: z.string().date(),
  }),
]);

export const CreateReminderPayload = z.object({
  animalId: z.string().min(1),
  title: z.string().trim().min(1).max(60),
  type: z.string().min(1).max(30),
  schedule: ScheduleSchema,
  timezone: TimezoneSchema,
  enabled: z.boolean().default(true),
});

export const UpdateReminderPayload = CreateReminderPayload.partial().extend({
  reminderId: z.string().min(1),
});
