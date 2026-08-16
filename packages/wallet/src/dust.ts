/**
 * First-time DUST setup: a wallet that has just received NIGHT generates NO
 * DUST — and therefore cannot pay for anything — until it registers its NIGHT
 * UTXOs for generation and designates a DUST address (normally its own).
 *
 * This never comes up on localnet: the dev genesis pre-registers its funded
 * accounts (which is why they sit at the DUST cap). It is the FIRST thing a
 * faucet-funded Stagenet wallet must do, and the registration transaction is
 * special: it pays its own fee out of the dust its UTXOs are *projected* to
 * generate, so the SDK waits until that projection covers the fee before
 * submitting (`waitForGeneratedDust` + `allow_fee_payment`).
 *
 * Sequence, all through the wallet facade:
 *   estimateRegistration → waitForGeneratedDust(fee) →
 *   registerNightUtxosForDustGeneration(…, dustReceiver = own dust address) →
 *   signRecipe → finalizeRecipe (proves) → submitTransaction.
 */

import type { UtxoWithMeta } from '@midnightntwrk/wallet-sdk-facade';

import type { MidnightWallet } from './index.ts';
import { formatDust, formatNight } from './units.ts';

/** The native (NIGHT) token type: 64 zero hex chars. */
const NIGHT_TOKEN = '0'.repeat(64);

export interface DustSetupStatus {
  /** NIGHT UTXOs already registered for DUST generation. */
  readonly registered: number;
  /** NIGHT UTXOs not yet generating DUST. */
  readonly unregistered: number;
  /** NIGHT held, in stars. */
  readonly nightStars: bigint;
  /** Current DUST balance, in specks. */
  readonly dustSpecks: bigint;
}

function nightUtxos(coins: readonly UtxoWithMeta[]): UtxoWithMeta[] {
  return coins.filter((coin) => String(coin.utxo.type) === NIGHT_TOKEN);
}

/** Where this wallet stands on DUST generation — read from a fresh sync. */
export async function dustSetupStatus(mw: MidnightWallet): Promise<DustSetupStatus> {
  const state = await mw.wallet.waitForSyncedState();
  const coins = nightUtxos(state.unshielded.availableCoins);
  const registered = coins.filter((c) => c.meta.registeredForDustGeneration).length;
  return {
    registered,
    unregistered: coins.length - registered,
    nightStars: BigInt(state.unshielded.balances?.[NIGHT_TOKEN] ?? 0n),
    dustSpecks: state.dust.balance(new Date()),
  };
}

export type DustSetupResult =
  | { readonly outcome: 'no-night' }
  | { readonly outcome: 'already-registered' }
  | { readonly outcome: 'registered'; readonly txId: string; readonly utxos: number };

/**
 * Designate this wallet's own DUST address and register every unregistered
 * NIGHT UTXO for generation. Idempotent: returns 'already-registered' when
 * there is nothing to do, 'no-night' when there is nothing to register with.
 *
 * `onProgress` receives human-readable step lines for the caller's log.
 */
export async function ensureDustGeneration(
  mw: MidnightWallet,
  options: { onProgress?: (message: string) => void; timeoutMs?: number } = {},
): Promise<DustSetupResult> {
  const say = options.onProgress ?? (() => {});
  const state = await mw.wallet.waitForSyncedState();
  const coins = nightUtxos(state.unshielded.availableCoins);
  const unregistered = coins.filter((c) => !c.meta.registeredForDustGeneration);

  if (coins.length === 0) return { outcome: 'no-night' };
  if (unregistered.length === 0) return { outcome: 'already-registered' };

  const { fee } = await mw.wallet.estimateRegistration(unregistered);
  say(
    `registering ${unregistered.length} NIGHT UTXO${unregistered.length === 1 ? '' : 's'} for DUST generation — ` +
      `the registration pays its own fee (${fee} specks) from projected generation`,
  );

  // Wait until the projected generation of the not-yet-registered UTXOs covers
  // the registration fee. Freshly received NIGHT accrues this in seconds.
  await mw.wallet.waitForGeneratedDust(unregistered, fee, {
    timeoutMs: options.timeoutMs ?? 300_000,
  });

  // dustReceiver = this wallet's own dust address — the normal case the caller
  // asked for ("designate itself"). A custodial setup would pass a different one.
  // The facade signs BOTH the registration segment and the unshielded inputs
  // through this callback — do NOT signRecipe afterwards, or the inputs carry
  // two signatures and the node rejects the tx as
  // Malformed(InputsSignaturesLengthMismatch). Measured, not assumed.
  const recipe = await mw.wallet.registerNightUtxosForDustGeneration(
    unregistered,
    mw.keystore.getPublicKey(),
    mw.keystore.signDataAsync,
    state.dust.address,
  );
  const finalized = await mw.wallet.finalizeRecipe(recipe);
  const txId = await mw.wallet.submitTransaction(finalized);
  say(`DUST registration submitted (tx ${String(txId).slice(0, 18)}…) — generation begins on inclusion`);

  return { outcome: 'registered', txId: String(txId), utxos: unregistered.length };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Block until this wallet holds NIGHT — the faucet hand-off gate. Polls a
 * fresh sync; returns the balance (stars) once non-zero.
 */
export async function waitForNightFunds(
  mw: MidnightWallet,
  options: { onProgress?: (message: string) => void; pollMs?: number; timeoutMs?: number } = {},
): Promise<bigint> {
  const say = options.onProgress ?? (() => {});
  const deadline = Date.now() + (options.timeoutMs ?? 15 * 60_000);
  for (;;) {
    const state = await mw.wallet.waitForSyncedState();
    const stars = BigInt(state.unshielded.balances?.[NIGHT_TOKEN] ?? 0n);
    if (stars > 0n) {
      say(`funds arrived — ${formatNight(stars)} NIGHT`);
      return stars;
    }
    if (Date.now() > deadline) throw new Error('timed out waiting for faucet funds');
    say('waiting for faucet funds — fund this wallet via its faucet row');
    await sleep(options.pollMs ?? 5000);
  }
}

/**
 * Block until spendable DUST reaches `minSpecks`. Freshly registered NIGHT
 * accrues DUST over minutes; transactions fail to balance until enough exists.
 */
export async function waitForSpendableDust(
  mw: MidnightWallet,
  minSpecks: bigint,
  options: { onProgress?: (message: string) => void; pollMs?: number; timeoutMs?: number } = {},
): Promise<bigint> {
  const say = options.onProgress ?? (() => {});
  const deadline = Date.now() + (options.timeoutMs ?? 15 * 60_000);
  for (;;) {
    const state = await mw.wallet.waitForSyncedState();
    const specks = state.dust.balance(new Date());
    if (specks >= minSpecks) {
      say(`DUST ready — ${formatDust(specks)} DUST spendable`);
      return specks;
    }
    if (Date.now() > deadline) throw new Error('timed out waiting for DUST to accrue');
    say(`DUST accruing — ${formatDust(specks)} of ${formatDust(minSpecks)} DUST needed for fees`);
    await sleep(options.pollMs ?? 5000);
  }
}

/**
 * The whole first-time gate for a hosted-network wallet, in order: wait for
 * faucet NIGHT, register DUST generation (idempotent), wait until enough DUST
 * accrued to actually pay for a transaction. Localnet never needs this — its
 * genesis wallets arrive funded and registered.
 */
export async function prepareHostedWallet(
  mw: MidnightWallet,
  options: { onProgress?: (message: string) => void; minDustSpecks?: bigint } = {},
): Promise<void> {
  await waitForNightFunds(mw, options);
  await ensureDustGeneration(mw, options);
  // 1 DUST covers a deploy or call with room to spare (a DUST registration
  // fee measures ~0.21 DUST on this stack).
  await waitForSpendableDust(mw, options.minDustSpecks ?? 10n ** 15n, options);
}
