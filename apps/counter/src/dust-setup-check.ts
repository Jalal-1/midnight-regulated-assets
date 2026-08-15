/**
 * First-time-wallet diagnostic: prove the DUST-setup path end to end.
 *
 * A brand-new wallet that has just RECEIVED NIGHT (faucet on Stagenet, a
 * transfer here) generates no DUST and cannot pay fees until it registers its
 * NIGHT UTXOs for generation. This script exercises exactly that path on
 * localnet, where it can be verified without a captcha:
 *
 *   1. build a FRESH random-seed wallet — 0 NIGHT, 0 DUST, nothing registered
 *   2. a genesis wallet transfers it 1,000 NIGHT (plain unshielded transfer)
 *   3. the fresh wallet's UTXO arrives UNREGISTERED for DUST generation
 *   4. ensureDustGeneration registers it (designating its own DUST address),
 *      the registration paying its own fee from projected generation
 *   5. DUST measurably accrues from zero
 *
 * Run:  node --experimental-strip-types apps/counter/src/dust-setup-check.ts
 * Needs: a running localnet. Localnet-only by design (well-known seeds).
 */

import { randomBytes } from 'node:crypto';

import { getNetwork, LOCALNET_GENESIS_SEEDS } from '@mra/network';
import {
  configureNetworkId,
  createWalletFromSeed,
  dustSetupStatus,
  ensureDustGeneration,
  formatDust,
  formatNight,
  STARS_PER_NIGHT,
} from '@mra/wallet';

const network = getNetwork();
if ((process.env.MRA_NETWORK ?? 'localnet') !== 'localnet') {
  throw new Error('localnet-only: uses well-known genesis seeds.');
}

const log = (message: string) => console.log(message);

async function main(): Promise<void> {
  await configureNetworkId(network);

  log('building genesis (funder) wallet…');
  const funder = await createWalletFromSeed(LOCALNET_GENESIS_SEEDS[0], network);
  log('building FRESH wallet from a random seed…');
  const freshSeed = randomBytes(32).toString('hex');
  const fresh = await createWalletFromSeed(freshSeed, network);

  try {
    const funderState = await funder.wallet.waitForSyncedState();
    const freshState = await fresh.wallet.waitForSyncedState();

    const before = await dustSetupStatus(fresh);
    log(
      `fresh wallet before funding: ${formatNight(before.nightStars)} NIGHT · ` +
        `${formatDust(before.dustSpecks)} DUST · registered UTXOs ${before.registered}`,
    );
    if (before.nightStars !== 0n) throw new Error('expected an empty fresh wallet');

    // Plain unshielded NIGHT transfer: genesis → fresh (this is the faucet's job
    // on Stagenet).
    log('funder transfers 1,000 NIGHT to the fresh wallet…');
    const recipe = await funder.wallet.transferTransaction(
      [
        {
          type: 'unshielded',
          outputs: [
            {
              type: '0'.repeat(64),
              receiverAddress: freshState.unshielded.address,
              amount: 1000n * STARS_PER_NIGHT,
            },
          ],
        },
      ],
      { shieldedSecretKeys: funder.shieldedSecretKeys, dustSecretKey: funder.dustSecretKey },
      { ttl: new Date(Date.now() + 5 * 60_000) },
    );
    const signed = await funder.wallet.signRecipe(recipe, funder.keystore.signDataAsync);
    const finalized = await funder.wallet.finalizeRecipe(signed);
    const txId = await funder.wallet.submitTransaction(finalized);
    log(`  transfer submitted: tx ${String(txId).slice(0, 18)}…`);

    // Wait for the funds to land in the fresh wallet's synced view.
    let funded = await dustSetupStatus(fresh);
    for (let i = 0; i < 60 && funded.nightStars === 0n; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      funded = await dustSetupStatus(fresh);
    }
    if (funded.nightStars === 0n) throw new Error('funds never arrived');
    log(
      `fresh wallet funded: ${formatNight(funded.nightStars)} NIGHT · ` +
        `DUST ${formatDust(funded.dustSpecks)} · UTXOs registered ${funded.registered}, ` +
        `unregistered ${funded.unregistered}`,
    );
    if (funded.unregistered === 0) {
      throw new Error('expected the received UTXO to be UNREGISTERED — the premise of this check');
    }

    // The actual first-time setup, exactly as the portal runs it.
    const result = await ensureDustGeneration(fresh, { onProgress: (m) => log(`  ${m}`) });
    if (result.outcome !== 'registered') throw new Error(`unexpected outcome: ${result.outcome}`);

    // DUST must now measurably accrue from zero.
    let after = await dustSetupStatus(fresh);
    for (let i = 0; i < 90 && after.dustSpecks === 0n; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      after = await dustSetupStatus(fresh);
    }
    log(
      `after registration: UTXOs registered ${after.registered} · ` +
        `DUST ${formatDust(after.dustSpecks)} and growing`,
    );
    if (after.registered === 0) throw new Error('UTXO did not register');
    if (after.dustSpecks === 0n) throw new Error('DUST did not start generating');

    log('\nOK — fresh wallet funded, DUST address designated (itself), generation live.');
  } finally {
    // No process.exit here: exiting in a finally masks in-flight failures as
    // success. Success exits below; failures reach the catch and exit 1.
    await Promise.allSettled([funder.wallet.stop(), fresh.wallet.stop()]);
  }
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error('\nfailed:', error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
