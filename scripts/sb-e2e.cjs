const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const logs = [];
  page.on('console', (message) => logs.push(`${message.type()}: ${message.text()}`));
  page.on('pageerror', (error) => logs.push(`pageerror: ${error.message}`));

  await page.goto('http://127.0.0.1:5174/?mock=UtestA', { waitUntil: 'networkidle' });
  console.log('title:', await page.title());
  await page.getByRole('button', { name: '以 LINE 登入' }).click();
  await page.waitForTimeout(2500);
  console.log('url:', page.url());
  console.log('body:', (await page.textContent('body')).replace(/\s+/g, ' ').slice(0, 700));
  await page.screenshot({ path: '/tmp/taijian-sb-today.png', fullPage: true });
  console.log('logs:', logs.join(' | '));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
