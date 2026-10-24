import { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import type { CommandResult } from '@taijian/domain';
import type { Tx } from '../src/lib/firestore';
import { getReplay } from '../src/lib/idempotency';

const response: CommandResult = {
  ok: true,
  commandId: 'cmd_1',
  data: { householdId: 'h1' },
  serverTime: '2026-10-24T00:00:00.000Z',
};

function fakeTx(data?: Record<string, unknown>): Tx {
  return {
    get: async () => ({ exists: data !== undefined, data: () => data }),
  } as unknown as Tx;
}

const FUTURE = Timestamp.fromMillis(Date.now() + 60_000);
const PAST = Timestamp.fromMillis(Date.now() - 60_000);

describe('getReplay', () => {
  it('returns the stored response for the same caller and payload', async () => {
    const tx = fakeTx({ uid: 'u1', requestHash: 'hash-1', response, expiresAt: FUTURE });
    await expect(getReplay(tx, 'u1', 'cmd_1', 'hash-1')).resolves.toEqual(response);
  });

  it('treats another user as an idempotency mismatch', async () => {
    const tx = fakeTx({ uid: 'u1', requestHash: 'hash-1', response, expiresAt: FUTURE });
    await expect(getReplay(tx, 'u2', 'cmd_1', 'hash-1')).rejects.toMatchObject({
      code: 'IDEMPOTENCY_MISMATCH',
    });
  });

  it('treats a different payload hash as an idempotency mismatch', async () => {
    const tx = fakeTx({ uid: 'u1', requestHash: 'hash-1', response, expiresAt: FUTURE });
    await expect(getReplay(tx, 'u1', 'cmd_1', 'hash-2')).rejects.toMatchObject({
      code: 'IDEMPOTENCY_MISMATCH',
    });
  });

  it('ignores a command whose 24h window has expired', async () => {
    const tx = fakeTx({ uid: 'u1', requestHash: 'hash-1', response, expiresAt: PAST });
    await expect(getReplay(tx, 'u1', 'cmd_1', 'hash-1')).resolves.toBeNull();
  });

  it('ignores an unknown command id', async () => {
    await expect(getReplay(fakeTx(), 'u1', 'cmd_1', 'hash-1')).resolves.toBeNull();
  });
});
