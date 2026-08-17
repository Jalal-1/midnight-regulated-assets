/**
 * Portal smoke: every route resolves directly (refresh-safe), redirects land,
 * no page errors, and the layout works at desktop and mobile widths.
 *
 * Usage: yarn ui (in one shell), then: node apps/portal/e2e-portal.mjs
 */
import { firefox } from 'playwright';

const BASE = process.env.UI_URL ?? 'http://localhost:5173';
const ROUTES = [
  ['/', 'Regulated assets'],
  ['/studio', 'Issue regulated assets on Midnight'],

  ['/why', 'Privacy you can configure'],
  ['/compare', 'Five ways to represent'],
  ['/learn', 'Guided walkthroughs'],
  ['/learn/topic#ledger', 'dual-state ledger'],
  ['/labs/public-token', 'Public account-based contract token'],
  ['/labs/confidential-token', 'Confidential account-based contract token'],
  ['/models/native-unshielded', 'Native unshielded UTXO asset'],
  ['/models/native-shielded', 'Native shielded UTXO asset'],
  ['/models/shielded-contract-token', 'Shielded (note-based) contract token'],
  ['/solutions', 'asset model to financial product'],
  ['/solutions/tokenised-deposits', 'Commercial-bank money'],
  ['/solutions/rwa', 'money-market fund share'],
  ['/standards', 'built on'],
  ['/build', 'Run everything yourself'],
  ['/build/counter', 'Counter'],
];
const REDIRECTS = [
  ['/counter', '/build/counter'],
  ['/unshielded-token', '/labs/public-token'],
  ['/deposit', '/labs/public-token'],
  ['/examples', '/learn'],
];

const browser = await firefox.launch();
const problems = [];

for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => problems.push(`[${viewport.width}] pageerror: ${e.message}`));
  for (const [route, expect] of ROUTES) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    const text = await page.locator('h1').first().innerText().catch(() => '');
    if (!text.toLowerCase().includes(expect.toLowerCase().slice(0, 24))) {
      problems.push(`[${viewport.width}] ${route}: expected h1 ~"${expect}", got "${text.slice(0, 60)}"`);
    }
    const hscroll = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    if (hscroll && route !== '/build/counter') {
      problems.push(`[${viewport.width}] ${route}: horizontal page scroll`);
    }
  }
  for (const [from, to] of REDIRECTS) {
    await page.goto(`${BASE}${from}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    if (!page.url().includes(to)) problems.push(`[${viewport.width}] ${from} did not land on ${to}`);
  }
  await page.close();
}

console.log(problems.length ? `FAIL\n${problems.join('\n')}` : `OK — ${ROUTES.length} routes × 2 viewports, ${REDIRECTS.length} redirects`);
await browser.close();
process.exit(problems.length ? 1 : 0);
