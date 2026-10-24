/**
 * App Check is optional in local development (and in the E2E suite) and
 * required in production. A missing site key must skip initialization entirely
 * so an emulator run without App Check still works.
 */
export type AppCheckSettings =
  | { enabled: false }
  | { enabled: true; siteKey: string; debugToken?: string };

export function appCheckSettings(env: {
  siteKey?: string;
  debugToken?: string;
  dev: boolean;
}): AppCheckSettings {
  const siteKey = env.siteKey?.trim();
  if (!siteKey) return { enabled: false };
  const debugToken = env.dev ? env.debugToken?.trim() : undefined;
  return debugToken ? { enabled: true, siteKey, debugToken } : { enabled: true, siteKey };
}
