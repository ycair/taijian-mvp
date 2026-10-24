import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearLineVerifyCache,
  verifiedLineProfile,
  verifyLineIdToken,
  verifyLineSignature,
} from '../src/line/verify';

const LINE_ISSUER = 'https://access.line.me';

function stubVerify(payload: Record<string, unknown>, ok = true): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 400,
      json: async () => payload,
    }),
  );
}

function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    aud: 'channel-1',
    sub: 'U123',
    name: 'Test',
    picture: 'https://x',
    iss: LINE_ISSUER,
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  clearLineVerifyCache();
});

describe('LINE verification', () => {
  it('accepts a valid webhook signature', () => {
    const body = Buffer.from('{"events":[]}');
    const secret = 'secret';
    const signature = createHmac('sha256', secret).update(body).digest('base64');
    expect(verifyLineSignature(body, secret, signature)).toBe(true);
  });

  it('rejects a tampered webhook body', () => {
    const body = Buffer.from('{"events":[]}');
    const signature = createHmac('sha256', 'secret').update(body).digest('base64');
    expect(verifyLineSignature(Buffer.from('{"events":[{}]}'), 'secret', signature)).toBe(false);
  });

  it('verifies a LINE ID token and checks the audience', async () => {
    stubVerify(validPayload());
    const profile = await verifyLineIdToken('id-token', 'channel-1');
    expect(profile.sub).toBe('U123');
    expect(profile.name).toBe('Test');
  });

  it('rejects a mismatched audience', async () => {
    stubVerify(validPayload({ aud: 'other-channel' }));
    await expect(verifyLineIdToken('id-token', 'channel-1')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('rejects a token whose issuer is not LINE', async () => {
    stubVerify(validPayload({ iss: 'https://evil.example.com' }));
    await expect(verifyLineIdToken('id-token', 'channel-1')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('rejects a token without an issuer', async () => {
    stubVerify(validPayload({ iss: undefined }));
    await expect(verifyLineIdToken('id-token', 'channel-1')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('rejects a missing expiry', async () => {
    stubVerify(validPayload({ exp: undefined }));
    await expect(verifyLineIdToken('id-token', 'channel-1')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('rejects an expired token', async () => {
    stubVerify(validPayload({ exp: Math.floor(Date.now() / 1000) - 1 }));
    await expect(verifyLineIdToken('id-token', 'channel-1')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('rejects a token the verification endpoint refuses', async () => {
    stubVerify({ error: 'invalid_request' }, false);
    await expect(verifyLineIdToken('id-token', 'channel-1')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('memoizes one exchange per ID token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => validPayload() });
    vi.stubGlobal('fetch', fetchMock);

    const [first, second] = await Promise.all([
      verifiedLineProfile('same-token', 'channel-1'),
      verifiedLineProfile('same-token', 'channel-1'),
    ]);

    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
