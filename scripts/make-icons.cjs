/* Renders build/icon.svg to build/icon.png (512x512) and a multi-size build/icon.ico
 * (16-256 px) with Playwright's Chromium.  Run:  npm run icons */
const { chromium } = require('playwright');
const { existsSync, readdirSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { Buffer } = require('node:buffer');

const root = join(__dirname, '..');
const svg = readFileSync(join(root, 'build', 'icon.svg'), 'utf8').replace(/<\?xml[^>]*\?>/, '');
const SIZES = [16, 24, 32, 48, 64, 128, 256];

/** ICO container whose images are PNG-compressed (supported by Windows Vista and later). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const directory = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry[0] = size === 256 ? 0 : size;
    entry[1] = size === 256 ? 0 : size;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...directory, ...images.map((i) => i.png)]);
}

/** Prefer the browser Playwright expects; fall back to any Chromium already in its cache. */
async function launch() {
  try {
    return await chromium.launch();
  } catch (error) {
    const cache = join(process.env.LOCALAPPDATA || '', 'ms-playwright');
    const found = existsSync(cache)
      ? readdirSync(cache)
          .filter((name) => name.startsWith('chromium-'))
          .map((name) => join(cache, name, 'chrome-win64', 'chrome.exe'))
          .find((path) => existsSync(path))
      : undefined;
    if (!found) throw error;
    return chromium.launch({ executablePath: found });
  }
}

async function run() {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
    const render = async (size) => {
      await page.setContent(
        `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
      );
      return page.screenshot({
        omitBackground: true,
        clip: { x: 0, y: 0, width: size, height: size },
        type: 'png',
      });
    };
    const images = [];
    for (const size of SIZES) images.push({ size, png: await render(size) });
    const png512 = await render(512);
    writeFileSync(join(root, 'build', 'icon.png'), png512);
    writeFileSync(join(root, 'build', 'icon.ico'), ico(images));
    console.log(`icon.png ${png512.length} bytes, icon.ico ${images.length} sizes`);
  } finally {
    await browser.close();
  }
}
run().catch((error) => {
  console.error(error);
  process.exit(1);
});
