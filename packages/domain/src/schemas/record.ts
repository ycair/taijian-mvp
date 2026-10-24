import { z } from 'zod';
import { IdSchema, UuidSchema } from './common';

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

/** A measurement (grams, millilitres, degrees) is never negative or unbounded. */
export const RECORD_VALUE_MAX = 1_000_000;
export const RecordValueSchema = z.number().finite().min(0).max(RECORD_VALUE_MAX);

/**
 * `metadata` is a small per-record bag (device id, source, custom fields), not a
 * document store. The cap is measured on the serialized form because that is
 * what the write costs and what a reader has to parse.
 */
export const RECORD_METADATA_MAX_BYTES = 2048;
export const RecordMetadataSchema = z
  .record(z.unknown())
  .refine(
    (metadata) =>
      new TextEncoder().encode(JSON.stringify(metadata)).length <= RECORD_METADATA_MAX_BYTES,
    { message: `metadata must serialize to at most ${RECORD_METADATA_MAX_BYTES} bytes` },
  );

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
  animalId: IdSchema,
  type: RecordTypeSchema,
  occurredAt: OccurredAtSchema,
  value: RecordValueSchema.optional(),
  unit: z.string().max(16).optional(),
  note: z.string().max(1000).optional(),
  metadata: RecordMetadataSchema.optional(),
});

export const UpdateRecordPayload = CreateRecordPayload.omit({ animalId: true, recordId: true })
  .partial()
  .extend({ recordId: IdSchema });
