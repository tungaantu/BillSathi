/* Starts the packaged app (release/win-unpacked) with a throw-away profile and checks that the
 * database (sql.js wasm), migrations and the UI load.  Run after `npm run dist`:
 *   npm run smoke:packaged */
const { _electron: electron } = require('playwright');
const { existsSync, mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const assert = require('node:assert/strict');

async function run() {
  const executablePath = join(__dirname, '..', 'release', 'win-unpacked', 'BillSathi.exe');
  assert.ok(existsSync(executablePath), 'Run npm run dist first');
  const userData = mkdtempSync(join(tmpdir(), 'billsathi-packaged-'));
  const app = await electron.launch({
    executablePath,
    env: { ...process.env, BILLSATHI_USER_DATA: userData, BILLSATHI_DISPLAY: 'secondary' },
    timeout: 60000,
  });
  const errors = [];
  try {
    const page = await app.firstWindow();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    app.process().stderr.on('data', (c) => errors.push(String(c)));
    try {
      await page
        .getByRole('heading', { name: 'Let’s meet your business' })
        .waitFor({ timeout: 20000 });
    } catch (error) {
      console.error('Page text:', (await page.locator('body').innerText()).slice(0, 500));
      console.error('Problems:', errors.join(' | '));
      throw error;
    }
    const firms = await page.evaluate(() => window.api.firm.list());
    assert.equal(firms.ok, true);
    const units = await page.evaluate(() => window.api.units.list());
    assert.equal(units.ok && units.data.length > 20, true);
    assert.ok(existsSync(join(userData, 'billsathi.db')), 'database file was not created');
    const icon = await app.evaluate(
      ({ BrowserWindow }) => !BrowserWindow.getAllWindows()[0].isDestroyed(),
    );
    assert.equal(icon, true);
    assert.deepEqual(errors, []);
    console.log('Packaged app OK: UI, database and migrations load from the asar.');
  } finally {
    await app.close();
    rmSync(userData, { recursive: true, force: true });
  }
}
run().catch((error) => {
  console.error(error);
  process.exit(1);
});
