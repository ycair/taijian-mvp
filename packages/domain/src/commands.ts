import { z } from 'zod';
import { IdSchema } from './schemas/common';
import { CreateAnimalPayload, UpdateAnimalPayload } from './schemas/animal';
import {
  CreateHouseholdPayload,
  TimezoneSchema,
  UpdateHouseholdPayload,
} from './schemas/household';
import { AcceptInvitePayload, CreateInvitePayload, RevokeInvitePayload } from './schemas/invite';
import { CreateRecordPayload, UpdateRecordPayload } from './schemas/record';
import { CreateReminderPayload, UpdateReminderPayload } from './schemas/reminder';

export const UpdateProfilePayload = z.object({
  displayName: z.string().trim().min(1).max(40).optional(),
  avatarUrl: z.string().url().max(500).optional(),
  locale: z.string().max(10).optional(),
  timezone: TimezoneSchema.optional(),
});

/** LINE ID tokens are JWTs of a few KB; anything larger is not a token. */
export const LINE_ID_TOKEN_MAX_LENGTH = 4096;

export const CompleteTaskPayload = z.object({
  reminderId: IdSchema,
  dueDate: z.string().date(),
});

export const commandSchemas = {
  'household.create': CreateHouseholdPayload,
  'household.update': UpdateHouseholdPayload,
  'household.delete': z.object({}),
  'member.invite': CreateInvitePayload,
  'member.accept': AcceptInvitePayload,
  'member.revokeInvite': RevokeInvitePayload,
  'member.remove': z.object({ uid: IdSchema }),
  'member.updateRole': z.object({
    uid: IdSchema,
    role: z.enum(['owner', 'caretaker']),
  }),
  'member.leave': z.object({}),
  'animal.create': CreateAnimalPayload,
  'animal.update': UpdateAnimalPayload,
  'animal.archive': z.object({ animalId: IdSchema }),
  'animal.delete': z.object({ animalId: IdSchema }),
  'record.create': CreateRecordPayload,
  'record.update': UpdateRecordPayload,
  'record.delete': z.object({ recordId: IdSchema }),
  'reminder.create': CreateReminderPayload,
  'reminder.update': UpdateReminderPayload,
  'reminder.delete': z.object({ reminderId: IdSchema }),
  'task.complete': CompleteTaskPayload,
  'task.uncomplete': CompleteTaskPayload,
  'user.updateProfile': UpdateProfilePayload,
  'line.link': z.object({ idToken: z.string().min(1).max(LINE_ID_TOKEN_MAX_LENGTH) }),
  'line.unlink': z.object({}),
} as const;

export type CommandType = keyof typeof commandSchemas;

export function parseCommandPayload<T extends CommandType>(
  type: T,
  payload: unknown,
): z.infer<(typeof commandSchemas)[T]> {
  return commandSchemas[type].parse(payload) as z.infer<(typeof commandSchemas)[T]>;
}
