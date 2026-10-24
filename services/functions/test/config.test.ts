import { describe, expect, it } from 'vitest';
import { assertLineEndpoints } from '../src/config';

const VERIFY = 'https://api.line.me/oauth2/v2.1/verify';
const API = 'https://api.line.me';

describe('LINE endpoint allow-list', () => {
  it('accepts LINE hosts outside dev', () => {
    expect(() => assertLineEndpoints('prod', VERIFY, API)).not.toThrow();
    expect(() => assertLineEndpoints('staging', 'https://access.line.me/token', API)).not.toThrow();
  });

  it('rejects a verify URL pointed at another host outside dev', () => {
    expect(() => assertLineEndpoints('prod', 'https://evil.example/verify', API)).toThrow(
      /LINE_VERIFY_URL/,
    );
    expect(() =>
      assertLineEndpoints('staging', 'https://api.line.me.evil.example/verify', API),
    ).toThrow(/LINE_VERIFY_URL/);
  });

  it('rejects an API base pointed at another host outside dev', () => {
    expect(() => assertLineEndpoints('prod', VERIFY, 'https://attacker.example')).toThrow(
      /LINE_API_BASE/,
    );
  });

  it('allows a local mock in dev', () => {
    expect(() =>
      assertLineEndpoints(
        'dev',
        'http://127.0.0.1:4010/oauth2/v2.1/verify',
        'http://127.0.0.1:4010',
      ),
    ).not.toThrow();
  });
});
