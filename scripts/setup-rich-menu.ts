/**
 * Rich menu setup for the 苔間 official account.
 *
 * Dry run (default) prints the payload so an operator can review the copy:
 *
 *   LIFF_ID=1234567890-abcdefgh \
 *   LINE_CHANNEL_ACCESS_TOKEN=... \
 *   node scripts/setup-rich-menu.ts
 *
 * `--apply` creates the menu through the Messaging API and prints its id:
 *
 *   LIFF_ID=1234567890-abcdefgh \
 *   LINE_CHANNEL_ACCESS_TOKEN=... \
 *   node scripts/setup-rich-menu.ts --apply
 *
 * MANUAL STEP: this script does not upload the menu image. LINE requires a
 * 2500×1686 PNG/JPEG under the rich menu id it returns:
 *
 *   curl -X POST "https://api-data.line.me/v2/bot/richmenu/<richMenuId>/content" \
 *     -H "Authorization: Bearer $LINE_CHANNEL_ACCESS_TOKEN" \
 *     -H "Content-Type: image/png" \
 *     --data-binary @scripts/line/rich-menu.png
 *
 * Then make it the default menu for every friend:
 *
 *   curl -X POST "https://api.line.me/v2/bot/user/all/richmenu/<richMenuId>" \
 *     -H "Authorization: Bearer $LINE_CHANNEL_ACCESS_TOKEN"
 *
 * Verify with `GET /v2/bot/richmenu/list`. No token is printed by this script.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const liffId = process.env.LIFF_ID;
const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!liffId || !token) throw new Error('LIFF_ID and LINE_CHANNEL_ACCESS_TOKEN are required');

const raw = readFileSync(resolve(HERE, 'line/rich-menu.json'), 'utf8').replaceAll(
  'REPLACE_LIFF_ID',
  liffId,
);
const body = JSON.parse(raw) as Record<string, unknown>;

if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify(body, null, 2));
  console.log('dry run: re-run with --apply to create this menu in LINE');
} else {
  if (liffId === 'REPLACE_LIFF_ID') {
    throw new Error('LIFF_ID is still the rich-menu placeholder');
  }

  const response = await fetch('https://api.line.me/v2/bot/richmenu', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`rich menu create failed: ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  console.log('rich menu created:', JSON.stringify(await response.json()));
  console.log(
    'next: upload the 2500x1686 image and set the menu as default (see the header of this script)',
  );
}
