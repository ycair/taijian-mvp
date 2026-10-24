import { z } from 'zod';

export const UuidSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    'invalid uuid',
  );

/**
 * Document ids are Firestore ids or stable derived keys. The cap keeps a single
 * request from carrying an unbounded string into a path lookup, a log line, or
 * a stored reference.
 */
export const ID_MAX_LENGTH = 128;
export const IdSchema = z.string().min(1).max(ID_MAX_LENGTH, 'id too long');

/** 24-hour wall clock time, zero padded (`08:30`, never `8:30`). */
export const ClockTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM');

export const PlatformSchema = z.enum(['liff', 'ios', 'android', 'bot', 'test']);
export const ClientInfoSchema = z.object({
  platform: PlatformSchema,
  appVersion: z.string().min(1).max(32),
});

export const CommandEnvelopeSchema = z.object({
  commandId: UuidSchema,
  type: z.string().min(1).max(64),
  householdId: IdSchema.optional(),
  baseRevision: z.number().int().min(0).optional(),
  payload: z.unknown(),
  client: ClientInfoSchema,
});

export type CommandEnvelope = z.infer<typeof CommandEnvelopeSchema>;
export type CommandSuccess<T> = {
  ok: true;
  commandId: string;
  revision?: number;
  data: T;
  serverTime: string;
};
export type CommandFailure = {
  ok: false;
  commandId: string;
  code: import('../errors').ErrorCode;
  message: string;
  current?: unknown;
  currentRevision?: number;
  lastChangedFields?: string[];
  serverTime: string;
};
export type CommandResult<T = unknown> = CommandSuccess<T> | CommandFailure;
