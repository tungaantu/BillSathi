const { chromium } = require('playwright');
const { spawn, execFileSync } = require('node:child_process');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
require('node:fs').mkdirSync(join(__dirname, '..', 'test-results'), { recursive: true });
const assert = require('node:assert/strict');
async function run() {
  const profile = mkdtempSync(join(tmpdir(), 'billsathi-dev-'));
  const child = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm run dev'], {
    windowsHide: true,
    env: {
      ...process.env,
      BILLSATHI_DISPLAY: 'secondary',
      BILLSATHI_USER_DATA: profile,
      REMOTE_DEBUGGING_PORT: '9337',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '',
    browser;
  child.stdout.on('data', (data) => {
    output += data.toString();
  });
  child.stderr.on('data', (data) => {
    output += data.toString();
  });
  try {
    for (let n = 0; n < 100; n++) {
      try {
        browser = await chromium.connectOverCDP('http://127.0.0.1:9337');
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
    if (!browser) throw new Error(output || 'Development app did not start');
    const context = browser.contexts()[0];
    let page = context.pages()[0];
    if (!page) page = await context.waitForEvent('page');
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (['error', 'warning'].includes(m.type())) errors.push(m.text());
    });
    await page.getByRole('heading', { name: 'Let’s meet your business', exact: true }).waitFor();
    const placement = await page.evaluate(() => ({
      x: window.screenX,
      y: window.screenY,
      left: window.screen.availLeft,
      top: window.screen.availTop,
    }));
    assert.equal(placement.x >= placement.left, true);
    const result = await page.evaluate(async () =>
      window.api.firm.create({
        name: 'Development Check',
        phone: '9876543210',
        category: 'grocery',
        stateCode: '29',
        gstin: '',
        pan: '',
        address: '',
        email: '',
        bankName: '',
        accountNumber: '',
        ifsc: '',
        upiId: '',
        demo: false,
      }),
    );
    assert.equal(result.ok, true);
    await page.reload();
    await page.getByRole('button', { name: 'New Sale', exact: true }).first().click();
    await page.getByRole('combobox', { name: 'Payment mode', exact: true }).waitFor();
    await page.waitForTimeout(900);
    assert.deepEqual(errors, []);
    assert.doesNotMatch(output, /Startup failed|Unable to load preload|Renderer stopped/);
    if (process.env.BILLSATHI_SHOW_WINDOW !== '0')
      await page.screenshot({ path: 'test-results/sales-dev.png' });
    console.log(
      'PASS: npm run dev launches on requested display, onboarding and sales editor render without console errors.',
      placement,
    );
    await page.evaluate(() => window.close());
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (child.pid)
      try {
        execFileSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
          windowsHide: true,
          stdio: 'ignore',
        });
      } catch {
        /* The development process may already have exited. */
      }
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
