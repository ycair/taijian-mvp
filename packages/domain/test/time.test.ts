import { describe, expect, it } from 'vitest';
import { localDateKey } from '../src/time';

describe('localDateKey', () => {
  it('uses the household timezone', () => {
    const instant = new Date('2026-10-23T16:30:00.000Z');
    expect(localDateKey(instant, 'Asia/Taipei')).toBe('2026-10-24');
    expect(localDateKey(instant, 'America/Los_Angeles')).toBe('2026-10-23');
  });
});
