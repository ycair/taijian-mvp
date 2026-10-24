import { z } from 'zod';
import { CreateAnimalPayload, UpdateAnimalPayload } from './schemas/animal';
import {
  CreateHouseholdPayload,
  TimezoneSchema,
  UpdateHouseholdPayload,
} from './schemas/household';
import { AcceptInvitePayload, CreateInvitePayload } from './schemas/invite';
import { CreateRecordPayload, UpdateRecordPayload } from './schemas/record';
import { CreateReminderPayload, UpdateReminderPayload } from './schemas/reminder';

export const UpdateProfilePayload = z.object({
  displayName: z.string().trim().min(1).max(40).optional(),
  avatarUrl: z.string().url().max(500).optional(),
  locale: z.string().max(10).optional(),
  timezone: TimezoneSchema.optional(),
});

export const CompleteTaskPayload = z.object({
  reminderId: z.string().min(1),
  dueDate: z.string().date(),
});

export const commandSchemas = {
  'household.create': CreateHouseholdPayload,
  'household.update': UpdateHouseholdPayload,
  'household.delete': z.object({}),
  'member.invite': CreateInvitePayload,
  'member.accept': AcceptInvitePayload,
  'member.remove': z.object({ uid: z.string().min(1) }),
  'member.updateRole': z.object({
    uid: z.string().min(1),
    role: z.enum(['owner', 'caretaker']),
  }),
  'member.leave': z.object({}),
  'animal.create': CreateAnimalPayload,
  'animal.update': UpdateAnimalPayload,
  'animal.archive': z.object({ animalId: z.string().min(1) }),
  'animal.delete': z.object({ animalId: z.string().min(1) }),
  'record.create': CreateRecordPayload,
  'record.update': UpdateRecordPayload,
  'record.delete': z.object({ recordId: z.string().min(1) }),
  'reminder.create': CreateReminderPayload,
  'reminder.update': UpdateReminderPayload,
  'reminder.delete': z.object({ reminderId: z.string().min(1) }),
  'task.complete': CompleteTaskPayload,
  'task.uncomplete': CompleteTaskPayload,
  'user.updateProfile': UpdateProfilePayload,
  'line.link': z.object({ idToken: z.string().min(1) }),
  'line.unlink': z.object({}),
} as const;

export type CommandType = keyof typeof commandSchemas;

export function parseCommandPayload<T extends CommandType>(
  type: T,
  payload: unknown,
): z.infer<(typeof commandSchemas)[T]> {
  return commandSchemas[type].parse(payload) as z.infer<(typeof commandSchemas)[T]>;
}
