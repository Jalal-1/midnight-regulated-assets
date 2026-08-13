/**
 * Wallet proof — step 1 of the toolchain proof.
 *
 * Builds a wallet from a localnet genesis seed, syncs it, and prints balances.
 * If this does not show funds, deploying is pointless: nothing can pay fees.
 *
 * Run: node --experimental-strip-types apps/counter/src/wallet-check.ts
 */

import { getNetwork, LOCALNET_GENESIS_SEEDS } from '@mra/network';
import { configureNetworkId, createWalletFromSeed } from '@mra/wallet';

async function main(): Promise<void> {
  const network = getNetwork();
  if ((process.env.MRA_NETWORK ?? 'localnet') !== 'localnet') {
    throw new Error('localnet-only: it uses well-known genesis seeds. Use the faucet on Stagenet.');
  }

  console.log(`network ${network.networkId} · node ${network.nodeWs}`);
  await configureNetworkId(network);

  const seed = LOCALNET_GENESIS_SEEDS[0];
  console.log(`building wallet from genesis seed ${seed.slice(0, 8)}…`);

  const { wallet } = await createWalletFromSeed(seed, network);
  try {
    console.log('syncing (this is the slow part)…');
    const state = await wallet.waitForSyncedState();

    console.log('\nshielded');
    console.log('  address ', state.shielded.address);
    console.log('  balances', state.shielded.balances);
    console.log('unshielded');
    console.log('  address ', state.unshielded.address);
    console.log('  balances', state.unshielded.balances);
    console.log('dust');
    console.log('  address ', state.dust.address);
    console.log('  available', state.dust.availableCoins?.length ?? 0, 'coins');
  } finally {
    await wallet.stop();
  }
}

main().catch((error: unknown) => {
  console.error('\nfailed:', error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
