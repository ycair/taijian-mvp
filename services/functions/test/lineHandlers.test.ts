import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HandlerContext } from '../src/commands/types';
import { config } from '../src/config';
import { clearAuthUserCache } from '../src/lib/authUser';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  db: { collection: vi.fn() },
}));

vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ getUser: mocks.getUser }) }));
vi.mock('../src/lib/firestore', () => ({ db: mocks.db }));

const { linkLine, unlinkLine } = await import('../src/commands/handlers/line');

const UID = 'line_U123';
const mappingRef = { path: 'lineUsers/U123' };

function stubLineVerify(sub = 'U123'): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        aud: config.LINE_LOGIN_CHANNEL_ID,
        sub,
        name: 'Test',
        iss: 'https://access.line.me',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    }),
  );
}

type TxMock = {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function makeTx(overrides: Partial<TxMock> = {}): TxMock {
  return {
    get: vi.fn().mockResolvedValue({ exists: false, data: () => undefined }),
    set: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

function makeCtx(tx: TxMock, payload: unknown = { idToken: 'id-token' }): HandlerContext {
  return {
    tx,
    uid: UID,
    envelope: {
      commandId: '0199a0b2-0000-7000-8000-000000000001',
      type: 'line.link',
      payload,
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
  clearAuthUserCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('linkLine', () => {
  it('rejects a LINE account actively linked to another user', async () => {
    stubLineVerify();
    const tx = makeTx({
      get: vi.fn().mockResolvedValue({
        exists: true,
        data: () => ({ uid: 'someone-else', status: 'active' }),
      }),
    });

    await expect(linkLine(makeCtx(tx))).rejects.toMatchObject({ code: 'LINE_ALREADY_LINKED' });
    expect(tx.set).not.toHaveBeenCalled();
  });

  it('rejects a deleted LINE account', async () => {
    stubLineVerify();
    const tx = makeTx({
      get: vi
        .fn()
        .mockResolvedValue({ exists: true, data: () => ({ uid: UID, status: 'deleted' }) }),
    });

    await expect(linkLine(makeCtx(tx))).rejects.toMatchObject({ code: 'LINE_ALREADY_LINKED' });
    expect(tx.set).not.toHaveBeenCalled();
  });

  it('creates a mapping with linkedAt for a new link', async () => {
    stubLineVerify();
    const tx = makeTx();

    const result = await linkLine(makeCtx(tx));

    expect(tx.set).toHaveBeenCalledWith(
      mappingRef,
      expect.objectContaining({ uid: UID, status: 'active' }),
      { merge: true },
    );
    const written = tx.set.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(written).toHaveProperty('linkedAt');
    expect(result).toMatchObject({ ok: true, data: { linked: true } });
  });

  it('re-activates an unlinked mapping without resetting linkedAt', async () => {
    stubLineVerify();
    const tx = makeTx({
      get: vi.fn().mockResolvedValue({
        exists: true,
        data: () => ({ uid: 'line_other', status: 'unlinked' }),
      }),
    });

    const result = await linkLine(makeCtx(tx));

    expect(tx.set).toHaveBeenCalledWith(
      mappingRef,
      expect.objectContaining({ uid: UID, status: 'active' }),
      { merge: true },
    );
    const written = tx.set.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(written).not.toHaveProperty('linkedAt');
    // Merge + FieldValue.delete() removes the audit timestamp on re-link.
    expect(written.unlinkedAt).toBeDefined();
    expect(result).toMatchObject({ ok: true, data: { linked: true } });
  });

  it('rejects a payload without an id token', async () => {
    const tx = makeTx();
    await expect(linkLine(makeCtx(tx, {}))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('unlinkLine', () => {
  it('refuses to unlink without a fallback sign-in provider', async () => {
    mocks.getUser.mockResolvedValue({ providerData: [{ providerId: 'custom' }] });
    const tx = makeTx();

    await expect(unlinkLine(makeCtx(tx))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.db.collection).not.toHaveBeenCalled();
    expect(tx.set).not.toHaveBeenCalled();
  });

  it('marks every active mapping unlinked instead of deleting it', async () => {
    mocks.getUser.mockResolvedValue({ providerData: [{ providerId: 'google.com' }] });
    const tx = makeTx({
      get: vi.fn().mockResolvedValue({
        empty: false,
        docs: [{ ref: mappingRef, data: () => ({ uid: UID, status: 'active' }) }],
      }),
    });

    const result = await unlinkLine(makeCtx(tx));

    expect(tx.delete).not.toHaveBeenCalled();
    expect(tx.set).toHaveBeenCalledWith(
      mappingRef,
      expect.objectContaining({ status: 'unlinked' }),
      { merge: true },
    );
    expect(result).toMatchObject({ ok: true, data: { linked: false } });
  });

  it('reports NOT_FOUND when no active mapping is linked', async () => {
    mocks.getUser.mockResolvedValue({ providerData: [{ providerId: 'apple.com' }] });
    const tx = makeTx({
      get: vi.fn().mockResolvedValue({
        empty: false,
        docs: [{ ref: mappingRef, data: () => ({ uid: UID, status: 'unlinked' }) }],
      }),
    });

    await expect(unlinkLine(makeCtx(tx))).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(tx.set).not.toHaveBeenCalled();
  });

  it('re-reads provider data when the cached record is stale', async () => {
    mocks.getUser
      .mockResolvedValueOnce({ providerData: [{ providerId: 'custom' }] })
      .mockResolvedValueOnce({ providerData: [{ providerId: 'google.com' }] });
    const tx = makeTx({
      get: vi.fn().mockResolvedValue({
        empty: false,
        docs: [{ ref: mappingRef, data: () => ({ uid: UID, status: 'active' }) }],
      }),
    });

    await expect(unlinkLine(makeCtx(tx))).resolves.toMatchObject({ ok: true });
    expect(mocks.getUser).toHaveBeenCalledTimes(2);
  });
});
