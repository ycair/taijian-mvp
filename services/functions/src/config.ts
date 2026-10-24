import { z } from 'zod';

/** Env vars arrive as strings; only the literal "true"/"1" enables a flag. */
const BooleanFlag = z
  .union([z.boolean(), z.string()])
  .default(false)
  .transform((value) => value === true || value === 'true' || value === '1');

const ConfigSchema = z.object({
  APP_ENV: z.enum(['dev', 'staging', 'prod']).default('dev'),
  ENFORCE_APP_CHECK: BooleanFlag,
  LINE_LOGIN_CHANNEL_ID: z.string().min(1).default('test-login-channel'),
  LINE_MESSAGING_CHANNEL_ID: z.string().min(1).default('test-messaging-channel'),
  LINE_MESSAGING_CHANNEL_SECRET: z.string().min(1).default('test-messaging-secret'),
  LINE_CHANNEL_ACCESS_TOKEN: z.string().min(1).default('test-access-token'),
  LINE_VERIFY_URL: z.string().url().default('https://api.line.me/oauth2/v2.1/verify'),
  LINE_API_BASE: z.string().url().default('https://api.line.me'),
  APP_BASE_URL: z.string().url().default('http://localhost:5000'),
  LIFF_ID: z.string().min(1).default('test-liff'),
});

export const config = ConfigSchema.parse(process.env);

/** The only hosts a production deployment may send LINE credentials to. */
const LINE_HOSTS = new Set(['api.line.me', 'access.line.me']);

/**
 * `LINE_VERIFY_URL` and `LINE_API_BASE` are configurable so tests can point at a
 * local mock. Outside `dev`, an override that sends an ID token or channel
 * secret to another host is a credential leak, so only LINE's own hosts are
 * accepted.
 */
export function assertLineEndpoints(appEnv: string, verifyUrl: string, apiBase: string): void {
  if (appEnv === 'dev') return;
  const endpoints: Array<[string, string]> = [
    ['LINE_VERIFY_URL', verifyUrl],
    ['LINE_API_BASE', apiBase],
  ];
  for (const [key, value] of endpoints) {
    const host = new URL(value).hostname;
    if (!LINE_HOSTS.has(host)) {
      throw new Error(`${key} must use api.line.me or access.line.me in ${appEnv}`);
    }
  }
}

assertLineEndpoints(config.APP_ENV, config.LINE_VERIFY_URL, config.LINE_API_BASE);

if (config.APP_ENV !== 'dev') {
  const forbiddenDefaults: Array<keyof typeof config> = [
    'LINE_MESSAGING_CHANNEL_SECRET',
    'LINE_CHANNEL_ACCESS_TOKEN',
  ];
  for (const key of forbiddenDefaults) {
    if (String(config[key]).startsWith('test-')) {
      throw new Error(`${key} must be configured for ${config.APP_ENV}`);
    }
  }
}
