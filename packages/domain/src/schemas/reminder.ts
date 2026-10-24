import { z } from 'zod';

const TimeSchema = z.string().regex(/^\d{2}:\d{2}$/);

export const ScheduleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('daily'), times: z.array(TimeSchema).min(1).max(4) }),
  z.object({
    kind: z.literal('weekly'),
    times: z.array(TimeSchema).min(1).max(4),
    weekdays: z.array(z.number().int().min(1).max(7)).min(1),
  }),
  z.object({
    kind: z.literal('interval'),
    times: z.array(TimeSchema).min(1).max(4),
    everyNDays: z.number().int().min(1).max(365),
    startDate: z.string().date(),
  }),
]);

export const CreateReminderPayload = z.object({
  animalId: z.string().min(1),
  title: z.string().trim().min(1).max(60),
  type: z.string().min(1).max(30),
  schedule: ScheduleSchema,
  timezone: z.string().min(1).max(60),
  enabled: z.boolean().default(true),
});

export const UpdateReminderPayload = CreateReminderPayload.partial().extend({
  reminderId: z.string().min(1),
});
