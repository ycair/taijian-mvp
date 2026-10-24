import { describe, expect, it } from 'vitest';
import { CommandEnvelopeSchema, commandSchemas, newCommandId } from '../src';

describe('command schemas', () => {
  it('accepts a valid envelope', () => {
    const envelope = CommandEnvelopeSchema.parse({
      commandId: newCommandId(),
      type: 'animal.create',
      householdId: 'hh_1',
      payload: {
        name: '阿肥',
        species: 'leopard-gecko',
        sex: 'unknown',
        avatarColor: '#7C9A76',
      },
      client: { platform: 'liff', appVersion: '1.0.0' },
    });
    expect(envelope.type).toBe('animal.create');
  });

  it('rejects an empty animal name', () => {
    const result = commandSchemas['animal.create'].safeParse({ name: '', species: 'leopard-gecko' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid record type', () => {
    const result = commandSchemas['record.create'].safeParse({
      animalId: 'a1',
      type: 'sleeping',
      occurredAt: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });
});
