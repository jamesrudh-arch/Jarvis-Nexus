// Diagram screenshot (skill-sanctioned pipeline for Report-route diagrams:
// "Or via Playwright directly: page.screenshot(... device_scale_factor 2)")
// NOT a PDF generator - PNG diagram capture only.
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const html = path.resolve(process.argv[2]);
  const out = process.argv[3];
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1500, height: 1080 },
    deviceScaleFactor: 2,
  });
  await page.goto('file://' + html, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const el = await page.$('.plan');
  await el.screenshot({ path: out });
  await browser.close();
  console.log('saved', out);
})().catch(e => { console.error(e); process.exit(1); });
