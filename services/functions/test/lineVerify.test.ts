import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyLineIdToken, verifyLineSignature } from '../src/line/verify';

afterEach(() => {
  vi.unstubAllGlobals();
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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ aud: 'channel-1', sub: 'U123', name: 'Test', picture: 'https://x' }),
      }),
    );
    const profile = await verifyLineIdToken('id-token', 'channel-1');
    expect(profile.sub).toBe('U123');
    expect(profile.name).toBe('Test');
  });

  it('rejects a mismatched audience', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ aud: 'other-channel', sub: 'U123' }),
      }),
    );
    await expect(verifyLineIdToken('id-token', 'channel-1')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('rejects a token whose issuer is not LINE', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          aud: 'channel-1',
          sub: 'U123',
          iss: 'https://evil.example.com',
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      }),
    );
    await expect(verifyLineIdToken('id-token', 'channel-1')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('rejects an expired token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          aud: 'channel-1',
          sub: 'U123',
          iss: 'https://access.line.me',
          exp: Math.floor(Date.now() / 1000) - 1,
        }),
      }),
    );
    await expect(verifyLineIdToken('id-token', 'channel-1')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('rejects a token the verification endpoint refuses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'invalid_request' }),
      }),
    );
    await expect(verifyLineIdToken('id-token', 'channel-1')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });
});
