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
    const result = commandSchemas['animal.create'].safeParse({
      name: '',
      species: 'leopard-gecko',
    });
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

  it('rejects a malformed commandId', () => {
    const result = CommandEnvelopeSchema.safeParse({
      commandId: 'not-a-uuid',
      type: 'animal.create',
      payload: {},
      client: { platform: 'liff', appVersion: '1.0.0' },
    });
    expect(result.success).toBe(false);
  });

  it('accepts a UUIDv7 commandId', () => {
    const commandId = newCommandId();
    expect(commandId[14]).toBe('7');
    const result = CommandEnvelopeSchema.safeParse({
      commandId,
      type: 'animal.create',
      payload: {},
      client: { platform: 'liff', appVersion: '1.0.0' },
    });
    expect(result.success).toBe(true);
  });
});

describe('animal update payload', () => {
  it('drops status so lifecycle changes only flow through animal.archive', () => {
    const parsed = commandSchemas['animal.update'].parse({ animalId: 'a1', status: 'archived' });
    expect(Object.hasOwn(parsed, 'status')).toBe(false);
  });
});

describe('invite payload', () => {
  it('rejects a missing invite token', () => {
    expect(commandSchemas['member.accept'].safeParse({}).success).toBe(false);
  });

  it('rejects a short invite token', () => {
    expect(commandSchemas['member.accept'].safeParse({ token: 'too-short' }).success).toBe(false);
  });

  it('requires an invite id to revoke', () => {
    expect(commandSchemas['member.revokeInvite'].safeParse({}).success).toBe(false);
    expect(commandSchemas['member.revokeInvite'].safeParse({ inviteId: 'inv_1' }).success).toBe(
      true,
    );
  });
});

describe('timezone validation', () => {
  it('rejects an invalid IANA timezone', () => {
    const result = commandSchemas['household.create'].safeParse({
      name: '苔間',
      timezone: 'Mars/Phobos',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid IANA timezone', () => {
    const result = commandSchemas['household.create'].safeParse({
      name: '苔間',
      timezone: 'Asia/Taipei',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid timezone in reminder and profile payloads', () => {
    const reminder = commandSchemas['reminder.create'].safeParse({
      animalId: 'a1',
      title: '餵食',
      type: 'feeding',
      schedule: { kind: 'daily', times: ['08:30'] },
      timezone: 'Mars/Phobos',
    });
    expect(reminder.success).toBe(false);
    expect(
      commandSchemas['user.updateProfile'].safeParse({ timezone: 'Mars/Phobos' }).success,
    ).toBe(false);
  });
});

describe('reminder schedule times', () => {
  const reminderWithTimes = (times: string[]) => ({
    animalId: 'a1',
    title: '餵食',
    type: 'feeding',
    schedule: { kind: 'daily' as const, times },
    timezone: 'Asia/Taipei',
  });

  const payloadWithSchedule = (schedule: unknown) => ({
    animalId: 'a1',
    title: '餵食',
    type: 'feeding',
    schedule,
    timezone: 'Asia/Taipei',
  });

  it('rejects impossible clock times', () => {
    expect(commandSchemas['reminder.create'].safeParse(reminderWithTimes(['99:99'])).success).toBe(
      false,
    );
    expect(commandSchemas['reminder.create'].safeParse(reminderWithTimes(['24:00'])).success).toBe(
      false,
    );
  });

  it('accepts a valid clock time', () => {
    expect(commandSchemas['reminder.create'].safeParse(reminderWithTimes(['08:30'])).success).toBe(
      true,
    );
  });

  it('rejects more than one time per day in v1', () => {
    // v1 keys notifications and completions by due date, so a second time of
    // day would be silently merged into the first.
    const times = ['08:30', '20:00'];
    const schedules = [
      { kind: 'daily', times },
      { kind: 'weekly', times, weekdays: [1] },
      { kind: 'interval', times, everyNDays: 2, startDate: '2026-10-24' },
    ];

    for (const schedule of schedules) {
      expect(
        commandSchemas['reminder.create'].safeParse(payloadWithSchedule(schedule)).success,
      ).toBe(false);
    }
  });
});

describe('record occurredAt bounds', () => {
  const recordAt = (occurredAt: string) => ({ animalId: 'a1', type: 'feeding', occurredAt });

  it('rejects a record from two years ago', () => {
    const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString();
    expect(commandSchemas['record.create'].safeParse(recordAt(twoYearsAgo)).success).toBe(false);
  });

  it('rejects a record an hour in the future', () => {
    const inOneHour = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    expect(commandSchemas['record.create'].safeParse(recordAt(inOneHour)).success).toBe(false);
  });

  it('accepts a current timestamp', () => {
    expect(
      commandSchemas['record.create'].safeParse(recordAt(new Date().toISOString())).success,
    ).toBe(true);
  });
});
