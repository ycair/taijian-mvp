import { expect, test } from '@playwright/test';

/**
 * Phase 1 smoke: a seeded LINE user lands on Today, sees the demo resident's
 * due feeding task, completes it, and the completion is rendered from the
 * Firestore listener (not just local optimistic state).
 *
 * `?mockLineIdToken=test-token-A` is only honoured when the Vite dev bundle has
 * VITE_USE_MOCK_LINE=true; `initLiff` then returns before touching LIFF.
 */
test('shows the seeded resident and completes a task', async ({ page }) => {
  await page.goto('/?mockLineIdToken=test-token-A');
  await expect(page.getByText('早安，今天也要好好照顧牠們。')).toBeVisible();
  await expect(page.getByText('阿肥 · 餵食')).toBeVisible();
  await page.getByText('阿肥 · 餵食').click();
  await expect(page.getByText(/已完成 by/)).toBeVisible();
});
