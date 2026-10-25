const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:5174/?mock=UtestA', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '以 LINE 登入' }).click();
  await page.waitForTimeout(2000);
  await page.getByText('阿肥 · 餵食').click();
  await page.waitForTimeout(1800);
  const body = (await page.textContent('body')).replace(/\s+/g, ' ');
  console.log('completed:', body.includes('已完成 by'));
  console.log('body:', body.slice(0, 500));
  console.log('errors:', errors.join(' | ') || 'none');
  await page.screenshot({ path: '/tmp/taijian-sb-completed.png', fullPage: true });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
