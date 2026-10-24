import { z } from 'zod';
import { UuidSchema } from './common';

export const RecordTypeSchema = z.enum([
  'feeding',
  'water',
  'weight',
  'poop',
  'shed',
  'activity',
  'medical',
  'note',
  'custom',
]);

const MAX_RECORD_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_RECORD_FUTURE_MS = 5 * 60 * 1000;

const OccurredAtSchema = z
  .string()
  .datetime()
  .refine((value) => {
    const timestamp = Date.parse(value);
    if (Number.isNaN(timestamp)) return false;
    const now = Date.now();
    return timestamp >= now - MAX_RECORD_AGE_MS && timestamp <= now + MAX_RECORD_FUTURE_MS;
  }, 'occurredAt must be within the last 365 days and no more than 5 minutes in the future');

export const CreateRecordPayload = z.object({
  recordId: UuidSchema.optional(),
  animalId: z.string().min(1),
  type: RecordTypeSchema,
  occurredAt: OccurredAtSchema,
  value: z.number().finite().optional(),
  unit: z.string().max(16).optional(),
  note: z.string().max(1000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const UpdateRecordPayload = CreateRecordPayload.omit({ animalId: true, recordId: true })
  .partial()
  .extend({ recordId: z.string().min(1) });
