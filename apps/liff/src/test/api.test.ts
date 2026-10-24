import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock('firebase/functions', () => ({ httpsCallable: () => h.execute }));
vi.mock('../lib/firebase', () => ({ functions: {} }));

import { callCommand } from '../lib/api';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

beforeEach(() => {
  h.execute.mockReset();
  h.execute.mockResolvedValue({ data: { ok: true, commandId: 'x', data: {}, serverTime: '' } });
});

describe('callCommand', () => {
  it('uses a caller-supplied command id so retries replay instead of duplicating', async () => {
    await callCommand('animal.create', { name: '阿肥' }, { commandId: 'fixed-command-id' });

    expect(h.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        commandId: 'fixed-command-id',
        type: 'animal.create',
        payload: { name: '阿肥' },
      }),
    );
  });

  it('generates a fresh UUID command id when none is supplied', async () => {
    await callCommand('animal.create', { name: '阿肥' });
    await callCommand('animal.create', { name: '阿肥' });

    const first = h.execute.mock.calls[0]?.[0] as { commandId: string };
    const second = h.execute.mock.calls[1]?.[0] as { commandId: string };
    expect(first.commandId).toMatch(UUID);
    expect(second.commandId).toMatch(UUID);
    expect(first.commandId).not.toBe(second.commandId);
  });

  it('forwards householdId and baseRevision when present', async () => {
    await callCommand('reminder.update', { reminderId: 'r1' }, {
      householdId: 'h1',
      baseRevision: 3,
      commandId: 'c1',
    });

    expect(h.execute).toHaveBeenCalledWith(
      expect.objectContaining({ householdId: 'h1', baseRevision: 3 }),
    );
  });
});
