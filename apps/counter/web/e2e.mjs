/**
 * Drives the counter UI in a real browser: connect, deploy, increment.
 *
 * This is the browser equivalent of apps/counter/src/deploy.ts. It exists
 * because "it builds" is not the same as "it works" — WASM loading, Node
 * polyfills, IndexedDB private state, and fetching proving keys over HTTP all
 * only fail at runtime.
 *
 * Usage: yarn ui (in one shell), then: node apps/counter/web/e2e.mjs
 */
import { firefox } from 'playwright';

const URL = process.env.UI_URL ?? 'http://localhost:5173/counter?autorun';
const TIMEOUT_MS = 240_000;

const browser = await firefox.launch();
// A realistic laptop viewport: the layout claims to fit one screen without
// scrolling, and that claim is only meaningful at a plausible size.
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });

const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`console: ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

const assetRequests = [];
page.on('response', (r) => {
  const u = r.url();
  // Everything not served by Vite: proof server, node RPC, indexer.
  if (!u.startsWith('http://localhost:5173') || u.includes('/managed/')) {
    assetRequests.push(`${r.status()} ${r.request().method()} ${u.replace('http://localhost:5173', '')}`);
  }
});

await page.goto(URL, { waitUntil: 'domcontentloaded' });

let done = false;
try {
  await page.waitForFunction(
    () => /autorun complete/.test(document.body.innerText) || document.querySelector('.log .error'),
    null,
    { timeout: TIMEOUT_MS },
  );
  done = true;
} catch {
  problems.push(`timed out after ${TIMEOUT_MS / 1000}s waiting for autorun to finish`);
}

// Contract history: deploy a second contract, then switch back to the older one
// and confirm the displayed round follows the selection.
let historyResult = 'skipped (set HISTORY=1)';
if (process.env.HISTORY === '1') {
  const roundOf = () => page.locator('.card .value').first().innerText();
  const idle = () =>
    page
      .waitForFunction(() => !document.body.innerText.includes('working —'), { timeout: 150_000 })
      .catch(() => {});

  const rowsBefore = await page.locator('.contract-row').count();

  await page.getByRole('button', { name: /Deploy another|Deploy contract/ }).click();
  await idle();
  await page.waitForTimeout(2500);
  const rowsAfter = await page.locator('.contract-row').count();

  // Increment the newest TWICE: autorun already left the first contract at
  // round 1, so a single increment would leave both contracts at 1 and the
  // switch assertion below could not tell them apart.
  for (let i = 0; i < 2; i += 1) {
    await page.getByRole('button', { name: 'increment()' }).click();
    await idle();
    await page.waitForTimeout(2000);
  }
  const newestRound = await roundOf();

  // Newest is first, so the last ENABLED row is the oldest usable contract.
  // Clicking `.last()` blindly hits the active row when history has one entry,
  // which fails as an opaque click timeout rather than a clear assertion.
  const enabled = page.locator('.contract-row:not([disabled])');
  const enabledCount = await enabled.count();
  if (enabledCount === 0) {
    problems.push('no selectable contract in history to switch to');
  } else {
    await enabled.last().click();
  }
  await page.waitForTimeout(4000);
  const switchedRound = await roundOf();
  const badges = await page.locator('.badge').allInnerTexts();

  historyResult =
    `rows ${rowsBefore}->${rowsAfter} · newest round=${newestRound} · ` +
    `after switching to oldest round=${switchedRound} · badges=[${badges.join(', ')}]`;
  if (rowsAfter <= rowsBefore) problems.push('second deploy did not appear in history');
  if (switchedRound === newestRound) {
    problems.push(`round did not change on switch (both ${switchedRound})`);
  }
}

// Open every per-component log drawer, so the screenshot shows them populated
// and we exercise the toggles.
const toggles = page.locator('.drawer-toggle');
const toggleCount = await toggles.count().catch(() => 0);
for (let i = 0; i < toggleCount; i += 1) {
  await toggles.nth(i).click().catch(() => {});
}

// The page must not scroll. Allow 1px for rounding.
const overflow = await page.evaluate(() => ({
  scrollHeight: document.documentElement.scrollHeight,
  innerHeight: window.innerHeight,
  bodyOverflowY: getComputedStyle(document.body).overflowY,
}));
const pageScrolls = overflow.scrollHeight > overflow.innerHeight + 1;
if (pageScrolls) {
  problems.push(
    `page scrolls: scrollHeight ${overflow.scrollHeight} > innerHeight ${overflow.innerHeight}`,
  );
}

const log = await page.locator('.log').innerText().catch(() => '(no log)');
const round = await page.locator('.card .value').first().innerText().catch(() => '?');
const headerVisible = await page
  .evaluate(() => {
    const h = document.querySelector('h1');
    if (!h) return false;
    const r = h.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight;
  })
  .catch(() => false);
if (!headerVisible) problems.push('header scrolled out of view — a fixed page must never do that');

// Viewport, not fullPage: fullPage on an overflow:hidden layout is misleading.
await page.screenshot({ path: process.env.SHOT ?? 'counter-ui.png' });
await browser.close();

console.log('--- UI log ---\n' + log);
console.log('--- round shown ---\n' + round);
console.log(`--- contract history ---\n${historyResult}`);
console.log(
  `--- layout ---\ndrawers: ${toggleCount} · header visible: ${headerVisible ? 'yes' : 'NO (bad)'} · page scrolls: ${pageScrolls ? 'YES (bad)' : 'no'} ` +
    `(scrollHeight ${overflow.scrollHeight} vs innerHeight ${overflow.innerHeight}, body overflow-y ${overflow.bodyOverflowY})`,
);
if (assetRequests.length) console.log('--- zk asset requests ---\n' + assetRequests.join('\n'));
else console.log('--- zk asset requests ---\n(none made)');
if (problems.length) console.log('--- problems ---\n' + problems.join('\n'));
process.exit(done && !problems.some((p) => p.startsWith('pageerror')) ? 0 : 1);
