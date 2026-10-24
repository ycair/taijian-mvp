import { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppError, newCommandId, type CommandResult } from '@taijian/domain';
import { adminDb, clearFirestore, envelope, readLimitCount } from './helpers';
import { runCommand } from '../../src/commands/runCommand';
import type { HandlerContext, HandlerMap } from '../../src/commands/types';
import { requestHash } from '../../src/lib/ids';
import { rateLimitDocId } from '../../src/lib/rateLimit';
import { toFailure } from '../../src/lib/result';

const UID_A = 'u_owner_a';
const UID_B = 'u_owner_b';

type Call = { uid: string; type: string; payload: unknown };

function success(commandId: string, data: unknown): CommandResult {
  return { ok: true, commandId, data, serverTime: new Date().toISOString() };
}

function makeHandlers(calls: Call[] = []): HandlerMap {
  const record = (ctx: HandlerContext): void => {
    calls.push({ uid: ctx.uid, type: ctx.envelope.type, payload: ctx.envelope.payload });
  };

  return {
    'household.create': async (ctx) => {
      record(ctx);
      // Reads then writes: proves the command transaction has no counter write
      // before the handler's reads.
      const snap = await ctx.tx.get(adminDb.collection('households').doc('h_stub'));
      const payload = ctx.envelope.payload as { name: string };
      ctx.tx.set(adminDb.collection('households').doc('h_stub'), {
        name: payload.name,
        existedBefore: snap.exists,
      });
      return success(ctx.envelope.commandId, { householdId: 'h_stub' });
    },
    'household.update': async (ctx) => {
      record(ctx);
      return success(ctx.envelope.commandId, { householdId: 'h_stub' });
    },
  };
}

beforeEach(async () => {
  await clearFirestore();
});

describe('runCommand idempotency', () => {
  it('replays a retried command without invoking the handler twice', async () => {
    const calls: Call[] = [];
    const handlers = makeHandlers(calls);
    const command = envelope('household.create', { name: 'Home' });

    const first = await runCommand({ uid: UID_A, envelope: command, source: 'test', handlers });
    const second = await runCommand({ uid: UID_A, envelope: command, source: 'test', handlers });

    expect(first.ok).toBe(true);
    expect(second).toEqual(first);
    expect(calls).toHaveLength(1);
  });

  it('rejects the same commandId with a different payload', async () => {
    const handlers = makeHandlers();
    const commandId = newCommandId();

    await runCommand({
      uid: UID_A,
      envelope: envelope('household.create', { name: 'Home' }, { commandId }),
      source: 'test',
      handlers,
    });

    await expect(
      runCommand({
        uid: UID_A,
        envelope: envelope('household.create', { name: 'Other home' }, { commandId }),
        source: 'test',
        handlers,
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_MISMATCH' });
  });

  it('rejects a replay by a different user', async () => {
    const handlers = makeHandlers();
    const command = envelope('household.create', { name: 'Home' });

    await runCommand({ uid: UID_A, envelope: command, source: 'test', handlers });

    await expect(
      runCommand({ uid: UID_B, envelope: command, source: 'test', handlers }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_MISMATCH' });
  });

  it('rejects the same commandId and payload in another household', async () => {
    const handlers = makeHandlers();
    const commandId = newCommandId();
    const payload = { name: 'Renamed' };

    await runCommand({
      uid: UID_A,
      envelope: envelope('household.update', payload, {
        commandId,
        householdId: 'h1',
        baseRevision: 0,
      }),
      source: 'test',
      handlers,
    });

    await expect(
      runCommand({
        uid: UID_A,
        envelope: envelope('household.update', payload, {
          commandId,
          householdId: 'h2',
          baseRevision: 0,
        }),
        source: 'test',
        handlers,
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_MISMATCH' });
  });

  it('ignores an expired command instead of replaying it', async () => {
    const calls: Call[] = [];
    const handlers = makeHandlers(calls);
    const commandId = newCommandId();
    const payload = { name: 'Home', timezone: 'Asia/Taipei' };

    await adminDb
      .collection('commands')
      .doc(commandId)
      .set({
        uid: UID_A,
        type: 'household.create',
        requestHash: requestHash('household.create', payload),
        response: success(commandId, { stale: true }),
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromMillis(Date.now() - 1_000),
      });

    const result = await runCommand({
      uid: UID_A,
      envelope: envelope('household.create', { name: 'Home' }, { commandId }),
      source: 'test',
      handlers,
    });

    expect(result).toMatchObject({ ok: true, data: { householdId: 'h_stub' } });
    expect(calls).toHaveLength(1);
  });
});

describe('runCommand payload handling', () => {
  it('hands the handler a normalized payload with extra keys stripped', async () => {
    const calls: Call[] = [];
    const handlers = makeHandlers(calls);

    await runCommand({
      uid: UID_A,
      envelope: envelope('household.create', { name: 'Home', junk: 'drop me' }),
      source: 'test',
      handlers,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.payload).toEqual({ name: 'Home', timezone: 'Asia/Taipei' });
    expect(calls[0]?.payload).not.toHaveProperty('junk');
  });

  it('maps an invalid payload to VALIDATION_ERROR rather than INTERNAL', async () => {
    const handlers = makeHandlers();
    const commandId = newCommandId();

    const error = await runCommand({
      uid: UID_A,
      envelope: envelope('household.create', { name: '' }, { commandId }),
      source: 'test',
      handlers,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: 'VALIDATION_ERROR' });

    const failure = toFailure(error, commandId);
    expect(failure.ok).toBe(false);
    if (!failure.ok) {
      expect(failure.code).toBe('VALIDATION_ERROR');
      expect(failure.message).toBe('invalid payload');
    }
  });

  it('maps an invalid envelope to VALIDATION_ERROR', async () => {
    const handlers = makeHandlers();

    await expect(
      runCommand({ uid: UID_A, envelope: { type: 'household.create' }, source: 'test', handlers }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('runCommand rate limits', () => {
  it('allows 100 commands per minute and rejects the 101st', async () => {
    const handlers = makeHandlers();

    for (let index = 0; index < 100; index += 1) {
      const result = await runCommand({
        uid: UID_A,
        envelope: envelope('household.create', { name: `Home ${index}` }),
        source: 'test',
        handlers,
      });
      expect(result.ok).toBe(true);
    }

    await expect(
      runCommand({
        uid: UID_A,
        envelope: envelope('household.create', { name: 'Home 101' }),
        source: 'test',
        handlers,
      }),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  }, 120_000);

  it('shares one global bucket across command types', async () => {
    const handlers = makeHandlers();

    await runCommand({
      uid: UID_A,
      envelope: envelope('household.create', { name: 'Home' }),
      source: 'test',
      handlers,
    });
    await runCommand({
      uid: UID_A,
      envelope: envelope('household.update', { name: 'Renamed' }, { householdId: 'h_stub' }),
      source: 'test',
      handlers,
    });

    const limits = await adminDb.collection('rateLimits').get();
    expect(limits.docs.map((doc) => doc.id)).toEqual([rateLimitDocId(UID_A, 'command')]);
    expect(await readLimitCount(UID_A, 'command')).toBe(2);
  });

  it('charges the global bucket for failed handlers', async () => {
    const failing: HandlerMap = {
      'household.create': async () => {
        throw new AppError('FORBIDDEN', 'not allowed');
      },
    };

    await expect(
      runCommand({
        uid: UID_A,
        envelope: envelope('household.create', { name: 'Home' }),
        source: 'test',
        handlers: failing,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(await readLimitCount(UID_A, 'command')).toBe(1);
  });

  it('charges the global bucket for invalid payloads', async () => {
    const handlers = makeHandlers();

    await expect(
      runCommand({
        uid: UID_A,
        envelope: envelope('household.create', { name: '' }),
        source: 'test',
        handlers,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    expect(await readLimitCount(UID_A, 'command')).toBe(1);
  });

  it('does not charge for a replayed command', async () => {
    const handlers = makeHandlers();
    const command = envelope('household.create', { name: 'Home' });

    await runCommand({ uid: UID_A, envelope: command, source: 'test', handlers });
    await runCommand({ uid: UID_A, envelope: command, source: 'test', handlers });
    await runCommand({ uid: UID_A, envelope: command, source: 'test', handlers });

    expect(await readLimitCount(UID_A, 'command')).toBe(1);
  });
});
