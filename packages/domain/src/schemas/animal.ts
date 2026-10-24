import { z } from 'zod';

export const SexSchema = z.enum(['male', 'female', 'unknown']);
export const AnimalStatusSchema = z.enum(['active', 'memorial', 'archived']);
export const AvatarColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

export const CreateAnimalPayload = z.object({
  name: z.string().trim().min(1).max(40),
  species: z.string().min(1).max(60),
  speciesLabel: z.string().trim().max(60).optional(),
  morph: z.string().trim().max(60).optional(),
  sex: SexSchema.default('unknown'),
  birthDate: z.string().date().optional(),
  adoptionDate: z.string().date().optional(),
  avatarColor: AvatarColorSchema.default('#7C9A76'),
  notes: z.string().max(2000).optional(),
});

export const UpdateAnimalPayload = CreateAnimalPayload.partial().extend({
  animalId: z.string().min(1),
});
