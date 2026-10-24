import { z } from 'zod';
import { IdSchema } from './common';

export const CreateInvitePayload = z.object({
  role: z.literal('caretaker').default('caretaker'),
  expiresInDays: z.number().int().min(1).max(30).default(7),
});

export const AcceptInvitePayload = z.object({
  token: z.string().min(20).max(200),
});

export const RevokeInvitePayload = z.object({
  inviteId: IdSchema,
});
