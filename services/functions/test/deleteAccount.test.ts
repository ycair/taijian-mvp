import { describe, expect, it } from 'vitest';
import { RECENT_AUTH_MAX_AGE_SECONDS, assertRecentAuth } from '../src/user/deleteAccount';

const NOW_MS = Date.parse('2026-10-24T12:00:00.000Z');
const nowSeconds = NOW_MS / 1000;

function codeOf(run: () => void): string | undefined {
  try {
    run();
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

describe('assertRecentAuth', () => {
  it('accepts a sign-in inside the five minute window', () => {
    expect(codeOf(() => assertRecentAuth({ auth_time: nowSeconds - 60 }, NOW_MS))).toBeUndefined();
    expect(
      codeOf(() =>
        assertRecentAuth({ auth_time: nowSeconds - RECENT_AUTH_MAX_AGE_SECONDS }, NOW_MS),
      ),
    ).toBeUndefined();
  });

  it('rejects a stale sign-in', () => {
    expect(
      codeOf(() =>
        assertRecentAuth({ auth_time: nowSeconds - RECENT_AUTH_MAX_AGE_SECONDS - 1 }, NOW_MS),
      ),
    ).toBe('UNAUTHENTICATED');
  });

  it('rejects a token without auth_time', () => {
    expect(codeOf(() => assertRecentAuth(undefined, NOW_MS))).toBe('UNAUTHENTICATED');
    expect(codeOf(() => assertRecentAuth({}, NOW_MS))).toBe('UNAUTHENTICATED');
    expect(codeOf(() => assertRecentAuth({ auth_time: 'yesterday' }, NOW_MS))).toBe(
      'UNAUTHENTICATED',
    );
  });

  it('rejects an auth_time far in the future', () => {
    expect(codeOf(() => assertRecentAuth({ auth_time: nowSeconds + 600 }, NOW_MS))).toBe(
      'UNAUTHENTICATED',
    );
  });
});
