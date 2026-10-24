import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HandlerContext } from '../src/commands/types';
import { config } from '../src/config';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  db: { collection: vi.fn() },
}));

vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ getUser: mocks.getUser }) }));
vi.mock('../src/lib/firestore', () => ({ db: mocks.db }));

const { linkLine, unlinkLine } = await import('../src/commands/handlers/line');

const UID = 'line_U123';
const mappingRef = { path: `lineUsers/U123` };

function makeTx(overrides: Partial<Record<'get' | 'set' | 'delete', unknown>> = {}) {
  return {
    get: vi.fn().mockResolvedValue({ exists: false, data: () => undefined }),
    set: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

function makeCtx(tx: ReturnType<typeof makeTx>): HandlerContext {
  return {
    tx,
    uid: UID,
    envelope: {
      commandId: '0199a0b2-0000-7000-8000-000000000001',
      type: 'line.link',
      payload: { idToken: 'id-token' },
      client: { platform: 'test', appVersion: '0.0.0' },
    },
    source: 'test',
    now: new Date('2026-10-24T00:00:00.000Z'),
  } as unknown as HandlerContext;
}

beforeEach(() => {
  mocks.getUser.mockReset();
  mocks.db.collection.mockReset();
  mocks.db.collection.mockReturnValue({
    doc: vi.fn(() => mappingRef),
    where: vi.fn(() => ({ kind: 'query' })),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('linkLine', () => {
  it('rejects a LINE account already linked to another user', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ aud: config.LINE_LOGIN_CHANNEL_ID, sub: 'U123', name: 'Test' }),
      }),
    );
    const tx = makeTx({
      get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ uid: 'someone-else' }) }),
    });

    await expect(linkLine(makeCtx(tx))).rejects.toMatchObject({ code: 'LINE_ALREADY_LINKED' });
    expect(tx.set).not.toHaveBeenCalled();
  });

  it('writes the mapping for the calling user', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ aud: config.LINE_LOGIN_CHANNEL_ID, sub: 'U123', name: 'Test' }),
      }),
    );
    const tx = makeTx();

    const result = await linkLine(makeCtx(tx));

    expect(tx.set).toHaveBeenCalledWith(mappingRef, expect.objectContaining({ uid: UID }), {
      merge: true,
    });
    expect(result).toMatchObject({ ok: true, data: { linked: true } });
  });
});

describe('unlinkLine', () => {
  it('refuses to unlink without a fallback sign-in provider', async () => {
    mocks.getUser.mockResolvedValue({ providerData: [{ providerId: 'custom' }] });
    const tx = makeTx();

    await expect(unlinkLine(makeCtx(tx))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.db.collection).not.toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it('deletes every LINE mapping when Apple or Google is linked', async () => {
    mocks.getUser.mockResolvedValue({ providerData: [{ providerId: 'google.com' }] });
    const tx = makeTx({
      get: vi.fn().mockResolvedValue({ empty: false, docs: [{ ref: mappingRef }] }),
    });

    const result = await unlinkLine(makeCtx(tx));

    expect(tx.delete).toHaveBeenCalledWith(mappingRef);
    expect(result).toMatchObject({ ok: true, data: { linked: false } });
  });

  it('reports NOT_FOUND when nothing is linked', async () => {
    mocks.getUser.mockResolvedValue({ providerData: [{ providerId: 'apple.com' }] });
    const tx = makeTx({ get: vi.fn().mockResolvedValue({ empty: true, docs: [] }) });

    await expect(unlinkLine(makeCtx(tx))).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(tx.delete).not.toHaveBeenCalled();
  });
});
