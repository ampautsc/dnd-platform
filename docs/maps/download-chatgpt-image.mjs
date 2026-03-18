/**
 * Playwright script to download the most recently generated DALL-E image
 * from the open ChatGPT Chrome session.
 *
 * Run: node docs/maps/download-chatgpt-image.mjs
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.resolve(__dirname, 'millhaven-ai-map.png');

// Same user data dir used when we first opened ChatGPT
const USER_DATA_DIR =
  process.env.PLAYWRIGHT_CHROME_PROFILE ||
  path.join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'User Data');

async function downloadUrl(url, dest) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    proto.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadUrl(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', reject);
  });
}

const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
  channel: 'chrome',
  headless: false,
  ignoreDefaultArgs: ['--enable-automation'],
  args: ['--disable-blink-features=AutomationControlled', '--start-maximized'],
});

// Grab whichever page is ChatGPT (or the first page)
let page = context.pages().find(p => p.url().includes('chatgpt.com')) ?? context.pages()[0];
if (!page) page = await context.newPage();

await page.bringToFront();
await page.waitForLoadState('domcontentloaded');

// Wait for a DALL-E result image to appear (up to 3 minutes)
console.log('Waiting for generated image…');
const imgLocator = page.locator('img[src*="oaiusercontent"], img[src*="oaistatic"], img[src*="dalle"]').last();
await imgLocator.waitFor({ state: 'visible', timeout: 180_000 });

const src = await imgLocator.getAttribute('src');
console.log('Found image src:', src?.slice(0, 120) + '…');

if (!src) {
  console.error('Could not find image src. Aborting.');
  await context.close();
  process.exit(1);
}

// Some DALL-E images are served as data URLs (rare) or HTTPS URLs
if (src.startsWith('data:')) {
  const base64 = src.split(',')[1];
  fs.writeFileSync(OUT_FILE, Buffer.from(base64, 'base64'));
} else {
  // Intercept via Playwright (handles auth cookies automatically)
  const [response] = await Promise.all([
    page.waitForResponse(r => r.url() === src, { timeout: 30_000 }).catch(() => null),
    page.evaluate(src => fetch(src).then(r => r.arrayBuffer()), src).catch(() => null),
  ]);

  if (response) {
    const body = await response.body();
    fs.writeFileSync(OUT_FILE, body);
  } else {
    // Fall back to direct download (may fail if cookies needed on a different origin)
    await downloadUrl(src, OUT_FILE);
  }
}

const stat = fs.statSync(OUT_FILE);
console.log(`Saved to ${OUT_FILE}  (${stat.size} bytes)`);

await context.close();
