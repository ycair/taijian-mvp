import { describe, expect, it } from 'vitest';
import { commandAttempt, recordAttempt } from '../lib/attempt';

describe('command attempts', () => {
  it('reuses the command id for an unchanged retry', () => {
    const first = commandAttempt(null, 'same-payload');
    const second = commandAttempt(first, 'same-payload');

    expect(second.commandId).toBe(first.commandId);
  });

  it('starts a new command id when the payload changes', () => {
    const first = commandAttempt(null, 'first');
    const second = commandAttempt(first, 'second');

    expect(second.commandId).not.toBe(first.commandId);
  });

  it('reuses the record id and occurredAt for an unchanged retry', () => {
    const now = new Date('2026-10-24T02:00:00.000Z');
    const first = recordAttempt(null, 'same-payload', now);
    const second = recordAttempt(first, 'same-payload', new Date('2026-10-24T03:00:00.000Z'));

    expect(second).toEqual(first);
    expect(second.recordId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
