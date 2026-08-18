/**
 * Headless studio lifecycle for the two UTXO token kinds, driven through the
 * real UI on localnet: wizard → deploy → issue 1000 to Alice → transfer 250
 * Alice→Bob → return 500 from Alice → verify balances.
 */
import { firefox } from 'playwright';

const BASE = process.env.UI_URL ?? 'http://localhost:5173';
const KINDS = [
  { card: 'Unshielded UTXO token', okIssue: 'Issued 1,000.00', okXfer: 'Transferred 250.00', okRet: 'Returned 500.00' },
  { card: 'ZSwap shielded UTXO token', okIssue: 'Issued 1,000.00', okXfer: 'Transferred 250.00', okRet: 'Returned 500.00' },
];

const browser = await firefox.launch();
const problems = [];

for (const K of KINDS) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  // Reloading aborts in-flight indexer/probe fetches — that abort is not a defect.
  page.on('pageerror', (e) => {
    if (!/operation was aborted/i.test(e.message)) problems.push(`[${K.card}] pageerror: ${e.message}`);
  });
  const fail = (m) => problems.push(`[${K.card}] ${m}`);
  try {
    await page.goto(`${BASE}/studio`, { waitUntil: 'domcontentloaded' });
    // Stagenet is the app default; this e2e drives the local stack.
    await page.evaluate(() => localStorage.setItem('mra.network.v1', 'localnet'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.evaluate(() => sessionStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });

    await page.locator('.st-pick.token', { hasText: K.card }).first().click();
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Continue →' }).click();
    // Step 5: pick localnet
    await page.locator('.st-pick.netcard', { hasText: 'Local development' }).click();
    await page.getByRole('button', { name: 'Continue →' }).click();
    // Step 6: review — defaults are fine; deploy
    await page.getByRole('button', { name: 'Deploy test asset →' }).click();

    await page.getByRole('heading', { name: 'Asset deployed' }).waitFor({ timeout: 300_000 });
    await page.getByRole('button', { name: 'Open the token dashboard →' }).click();

    // Ops live directly on the token page: issue, transfer, return cards in DOM order
    const ok = page.locator('.st-okbox');
    const cards = page.locator('.st-three > .st-card');

    await cards.nth(0).getByRole('button', { name: 'Issue', exact: true }).click();
    await ok.filter({ hasText: K.okIssue }).waitFor({ timeout: 180_000 });

    await cards.nth(1).getByRole('button', { name: 'Transfer', exact: true }).click();
    await ok.filter({ hasText: K.okXfer }).waitFor({ timeout: 180_000 });

    await cards.nth(2).getByRole('button', { name: 'Return', exact: true }).click();
    await ok.filter({ hasText: K.okRet }).waitFor({ timeout: 180_000 });

    // Balances: Alice 250, Bob 250 (issue 1000 − transfer 250 − return 500).
    // Poll: right after the return, the sender's change UTXO can still be
    // pending in her own wallet view — the dashboard's 5 s poll self-corrects.
    const holderView = page.locator('.st-holderview');
    let text = '';
    const deadline = Date.now() + 90_000;
    for (;;) {
      text = (await holderView.innerText()).replace(/\s+/g, ' ');
      if (/Alice 250\.00/.test(text) && /Bob 250\.00/.test(text)) break;
      if (Date.now() > deadline) {
        fail(`balances never settled at Alice 250 / Bob 250: ${text}`);
        break;
      }
      await page.waitForTimeout(5_000);
    }

    // Tiles sit on the token page itself: total issued stays 1,000.00, returned 500
    const tiles = (await page.locator('.st-tiles').innerText()).replace(/\s+/g, ' ');
    if (!/Total issued · public 1,000\.00/.test(tiles)) fail(`supply tile wrong: ${tiles}`);
    if (!/Returned this session 500\.00/.test(tiles)) fail(`returned tile wrong: ${tiles}`);
    console.log(`OK — ${K.card}: full lifecycle through the dashboard UI`);
  } catch (e) {
    fail(`threw: ${String(e).slice(0, 300)}`);
    await page.screenshot({ path: `${process.env.SCRATCH ?? '.'}/studio-fail-${K.card.split(' ')[0]}.png`, fullPage: true }).catch(() => {});
  }
  await page.close();
}

console.log(problems.length ? `FAIL\n${problems.join('\n')}` : 'OK — both UTXO kinds verified through the dashboard');
await browser.close();
process.exit(problems.length ? 1 : 0);
