import { z } from 'zod';

export const TimezoneSchema = z.string().min(1).max(60);
export const CreateHouseholdPayload = z.object({
  name: z.string().trim().min(1).max(40),
  timezone: TimezoneSchema.default('Asia/Taipei'),
});
export const UpdateHouseholdPayload = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  timezone: TimezoneSchema.optional(),
  settings: z
    .object({
      quietHours: z.object({ start: z.string(), end: z.string() }).optional(),
      notificationsEnabled: z.boolean().optional(),
    })
    .optional(),
});
export type CreateHouseholdInput = z.infer<typeof CreateHouseholdPayload>;
