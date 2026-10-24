import { describe, expect, it } from 'vitest';
import { isWithinQuietHours, notificationsEnabled } from '../src/reminders/scheduler';

describe('isWithinQuietHours', () => {
  it('matches a quiet window that wraps past midnight in the household timezone', () => {
    const quietHours = { start: '22:00', end: '07:00' };
    // Asia/Taipei is UTC+8; these instants are 22:30, 00:00, 06:59, and 07:00 local.
    expect(
      isWithinQuietHours(quietHours, new Date('2026-10-24T14:30:00.000Z'), 'Asia/Taipei'),
    ).toBe(true);
    expect(
      isWithinQuietHours(quietHours, new Date('2026-10-24T16:00:00.000Z'), 'Asia/Taipei'),
    ).toBe(true);
    expect(
      isWithinQuietHours(quietHours, new Date('2026-10-24T22:59:00.000Z'), 'Asia/Taipei'),
    ).toBe(true);
    expect(
      isWithinQuietHours(quietHours, new Date('2026-10-24T23:00:00.000Z'), 'Asia/Taipei'),
    ).toBe(false);
  });

  it('matches a same-day window and is exclusive at the end boundary', () => {
    const quietHours = { start: '13:00', end: '14:00' };
    expect(
      isWithinQuietHours(quietHours, new Date('2026-10-24T04:59:00.000Z'), 'Asia/Taipei'),
    ).toBe(false);
    expect(
      isWithinQuietHours(quietHours, new Date('2026-10-24T05:30:00.000Z'), 'Asia/Taipei'),
    ).toBe(true);
    expect(
      isWithinQuietHours(quietHours, new Date('2026-10-24T06:00:00.000Z'), 'Asia/Taipei'),
    ).toBe(false);
  });

  it('never suppresses a notification for a missing, empty, or malformed window', () => {
    const now = new Date('2026-10-24T14:30:00.000Z');
    expect(isWithinQuietHours(undefined, now, 'Asia/Taipei')).toBe(false);
    expect(isWithinQuietHours(null, now, 'Asia/Taipei')).toBe(false);
    expect(isWithinQuietHours({}, now, 'Asia/Taipei')).toBe(false);
    expect(isWithinQuietHours({ start: '22:00', end: '22:00' }, now, 'Asia/Taipei')).toBe(false);
    expect(isWithinQuietHours({ start: '25:00', end: '07:00' }, now, 'Asia/Taipei')).toBe(false);
    expect(isWithinQuietHours({ start: '22:00', end: '7:00' }, now, 'Asia/Taipei')).toBe(false);
    expect(isWithinQuietHours({ start: '22:00', end: '07:00' }, now, 'not/a-zone')).toBe(false);
  });
});

describe('notificationsEnabled', () => {
  it('defaults to on and only an explicit false opts out', () => {
    expect(notificationsEnabled(undefined)).toBe(true);
    expect(notificationsEnabled(null)).toBe(true);
    expect(notificationsEnabled({})).toBe(true);
    expect(notificationsEnabled({ notificationsEnabled: true })).toBe(true);
    expect(notificationsEnabled({ notificationsEnabled: false })).toBe(false);
  });
});
