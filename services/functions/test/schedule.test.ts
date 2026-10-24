import { describe, expect, it } from 'vitest';
import { computeNextDueAt } from '../src/lib/schedule';

describe('computeNextDueAt', () => {
  it('returns the next daily occurrence in the stored timezone', () => {
    const from = new Date('2026-10-24T00:00:00.000Z'); // 08:00 Asia/Taipei
    const next = computeNextDueAt({ kind: 'daily', times: ['08:30'] }, 'Asia/Taipei', from);
    expect(next.toISOString()).toBe('2026-10-24T00:30:00.000Z');
  });

  it('handles a DST spring-forward date without skipping the day', () => {
    const from = new Date('2027-03-14T12:00:00.000Z'); // 08:00 America/New_York
    const next = computeNextDueAt({ kind: 'daily', times: ['08:30'] }, 'America/New_York', from);
    expect(next.toISOString()).toBe('2027-03-14T12:30:00.000Z');
  });

  it('computes weekly schedules', () => {
    const from = new Date('2026-10-24T00:00:00.000Z'); // Saturday in Taipei
    const next = computeNextDueAt(
      { kind: 'weekly', times: ['09:00'], weekdays: [1] },
      'Asia/Taipei',
      from,
    );
    expect(next.toISOString()).toBe('2026-10-26T01:00:00.000Z'); // Monday 09:00
  });

  it('rolls a passed daily time over to the next local day', () => {
    const from = new Date('2026-10-24T00:45:00.000Z'); // 08:45 Asia/Taipei
    const next = computeNextDueAt(
      { kind: 'daily', times: ['08:30', '20:00'] },
      'Asia/Taipei',
      from,
    );
    expect(next.toISOString()).toBe('2026-10-24T12:00:00.000Z'); // same day 20:00

    const afterLast = computeNextDueAt(
      { kind: 'daily', times: ['08:30'] },
      'Asia/Taipei',
      new Date('2026-10-24T12:30:00.000Z'), // 20:30 Asia/Taipei
    );
    expect(afterLast.toISOString()).toBe('2026-10-25T00:30:00.000Z');
  });

  it('aligns interval schedules to their start date', () => {
    const schedule = {
      kind: 'interval' as const,
      times: ['09:00'],
      everyNDays: 3,
      startDate: '2026-10-01',
    };
    // 2026-10-02 09:00 Taipei: the next aligned occurrence is 10-04.
    const next = computeNextDueAt(schedule, 'Asia/Taipei', new Date('2026-10-02T01:00:00.000Z'));
    expect(next.toISOString()).toBe('2026-10-04T01:00:00.000Z');

    // A start date in the future wins over "today".
    const future = computeNextDueAt(
      { ...schedule, startDate: '2026-11-01' },
      'Asia/Taipei',
      new Date('2026-10-02T01:00:00.000Z'),
    );
    expect(future.toISOString()).toBe('2026-11-01T01:00:00.000Z');
  });
});
