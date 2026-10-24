import { z } from 'zod';

const ConfigSchema = z.object({
  APP_ENV: z.enum(['dev', 'staging', 'prod']).default('dev'),
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
