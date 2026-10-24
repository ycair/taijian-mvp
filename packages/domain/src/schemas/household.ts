import { z } from 'zod';
import { ClockTimeSchema } from './common';

export const TimezoneSchema = z
  .string()
  .min(1)
  .max(60)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'invalid IANA timezone');
export const CreateHouseholdPayload = z.object({
  name: z.string().trim().min(1).max(40),
  timezone: TimezoneSchema.default('Asia/Taipei'),
});
export const UpdateHouseholdPayload = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  timezone: TimezoneSchema.optional(),
  settings: z
    .object({
      quietHours: z.object({ start: ClockTimeSchema, end: ClockTimeSchema }).optional(),
      notificationsEnabled: z.boolean().optional(),
    })
    .optional(),
});
export type CreateHouseholdInput = z.infer<typeof CreateHouseholdPayload>;
