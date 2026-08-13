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

const URL = process.env.UI_URL ?? 'http://localhost:5173/?autorun';
const TIMEOUT_MS = 240_000;

const browser = await firefox.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });

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

const log = await page.locator('.log').innerText().catch(() => '(no log)');
const round = await page.locator('.card .value').first().innerText().catch(() => '?');
await page.screenshot({ path: process.env.SHOT ?? 'counter-ui.png', fullPage: true });
await browser.close();

console.log('--- UI log ---\n' + log);
console.log('--- round shown ---\n' + round);
if (assetRequests.length) console.log('--- zk asset requests ---\n' + assetRequests.join('\n'));
else console.log('--- zk asset requests ---\n(none made)');
if (problems.length) console.log('--- problems ---\n' + problems.join('\n'));
process.exit(done && !problems.some((p) => p.startsWith('pageerror')) ? 0 : 1);
