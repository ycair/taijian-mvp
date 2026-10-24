import { describe, expect, it } from 'vitest';
import { notificationKey } from '../src/reminders/scheduler';

describe('notificationKey', () => {
  it('deduplicates per reminder, date, and channel', () => {
    expect(notificationKey('r1', '2026-10-24', 'line')).toBe('r1_2026-10-24_line');
    expect(notificationKey('r1', '2026-10-24', 'fcm')).not.toBe(
      notificationKey('r1', '2026-10-24', 'line'),
    );
  });
});
