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

export const CreateRecordPayload = z.object({
  recordId: UuidSchema.optional(),
  animalId: z.string().min(1),
  type: RecordTypeSchema,
  occurredAt: z.string().datetime(),
  value: z.number().finite().optional(),
  unit: z.string().max(16).optional(),
  note: z.string().max(1000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const UpdateRecordPayload = CreateRecordPayload.omit({ animalId: true, recordId: true })
  .partial()
  .extend({ recordId: z.string().min(1) });
