import { describe, expect, it, vi } from 'vitest';
import { AppError, newCommandId, type CommandResult } from '@taijian/domain';
import { executeCommand, handleCommandRequest } from '../src/commands/execute';

const VALID_COMMAND = {
  commandId: newCommandId(),
  type: 'household.create',
  payload: { name: '家' },
  client: { platform: 'test' as const, appVersion: '1.0.0' },
};

const OK: CommandResult = {
  ok: true,
  commandId: VALID_COMMAND.commandId,
  data: { householdId: 'h1' },
  serverTime: '2026-10-24T00:00:00.000Z',
};

function runner(result: CommandResult = OK) {
  return vi.fn(async () => result);
}

describe('handleCommandRequest', () => {
  it('returns UNAUTHENTICATED when there is no auth user', async () => {
    const result = await handleCommandRequest(undefined, {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('UNAUTHENTICATED');
  });

  it('returns VALIDATION_ERROR for a malformed envelope', async () => {
    const result = await handleCommandRequest('u1', { type: 'animal.create' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a valid command from a tombstoned account without running it', async () => {
    const run = runner();

    const result = await handleCommandRequest('u1', VALID_COMMAND, {
      readProfile: async () => ({ deletedAt: '2026-10-24T00:00:00.000Z' }),
      runCommand: run,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('UNAUTHENTICATED');
      expect(result.commandId).toBe(VALID_COMMAND.commandId);
    }
    expect(run).not.toHaveBeenCalled();
  });

  it('treats an unprovisioned profile as allowed and runs the command', async () => {
    const run = runner();

    const result = await handleCommandRequest('u1', VALID_COMMAND, {
      readProfile: async () => undefined,
      runCommand: run,
    });

    expect(result).toEqual(OK);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith({
      uid: 'u1',
      envelope: VALID_COMMAND,
      source: 'test',
      handlers: expect.any(Object),
    });
  });

  it('treats a profile with a null deletedAt as alive', async () => {
    const run = runner();

    const result = await handleCommandRequest('u1', VALID_COMMAND, {
      readProfile: async () => ({ deletedAt: null }),
      runCommand: run,
    });

    expect(result).toEqual(OK);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('maps a runner failure to a CommandResult envelope', async () => {
    const result = await handleCommandRequest('u1', VALID_COMMAND, {
      readProfile: async () => undefined,
      runCommand: async () => {
        throw new AppError('RATE_LIMITED', 'too many commands');
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('RATE_LIMITED');
      expect(result.commandId).toBe(VALID_COMMAND.commandId);
    }
  });

  it('maps an unexpected profile-read error to INTERNAL', async () => {
    const run = runner();

    const result = await handleCommandRequest('u1', VALID_COMMAND, {
      readProfile: async () => {
        throw new Error('firestore unavailable');
      },
      runCommand: run,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INTERNAL');
    expect(run).not.toHaveBeenCalled();
  });
});

describe('executeCommand callable', () => {
  it('delegates to the shared entrypoint', async () => {
    const callable = executeCommand as unknown as {
      run: (request: unknown) => Promise<unknown>;
    };

    const result = (await callable.run({ data: {}, rawRequest: {} })) as CommandResult;

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('UNAUTHENTICATED');
  });
});
