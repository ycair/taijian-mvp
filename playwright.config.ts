import { defineConfig } from '@playwright/test';

/**
 * Local acceptance E2E. Requires the Firebase emulators (`pnpm emulators`),
 * the seeded demo household (`pnpm seed`), and the mock LINE server
 * (`pnpm mock:line`) in separate terminals. This is not wired into CI yet.
 */
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:5173', headless: true },
  webServer: {
    command: 'pnpm --filter @taijian/liff dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
