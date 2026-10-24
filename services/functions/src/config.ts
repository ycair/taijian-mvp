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
