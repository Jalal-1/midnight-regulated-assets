/**
 * Counter deploy — the toolchain proof.
 *
 * This is not a product. It answers one question: does the pinned stack
 * compile, deploy, prove, and submit end to end? If this fails, nothing
 * downstream is worth debugging.
 *
 * Run:  node --experimental-strip-types apps/counter/src/deploy.ts
 * Needs: a running localnet (`yarn localnet:up`) and a compiled contract
 *        (`yarn redeploy`).
 *
 * Budget minutes, not seconds: ~40 s to submit, ~70 s per proved call.
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import {
  breakdownWindow,
  describeBreakdown,
  getNetwork,
  LOCALNET_GENESIS_SEEDS,
  meterProving,
  type ProvingMeter,
} from '@mra/network';
import { configureNetworkId, createWalletFromSeed } from '@mra/wallet';
import { createProviders } from '@mra/wallet/providers';

import { Contract, ledger } from '../contract/managed/contract/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ZK_CONFIG_PATH = resolve(HERE, '../contract/managed');

/**
 * Localnet-only password for private-state-at-rest encryption. Encryption is not
 * optional in midnight-js 5.x, and the policy is strict: 16+ chars, 3 of 4
 * character classes, no more than 3 identical in a row.
 */
const PRIVATE_STATE_PASSWORD = process.env.MRA_PRIVATE_STATE_PASSWORD ?? 'Localnet-Dev-Pw-2026!';

/**
 * midnight-js 5.x describes a contract in the Effect idiom: `make` with a tag and
 * the generated constructor, then combinators for witnesses and asset location.
 * The counter declares no witnesses, hence `withVacantWitnesses`.
 */
const compiledContract = CompiledContract.make('counter', Contract).pipe(
  CompiledContract.withVacantWitnesses,
  CompiledContract.withCompiledFileAssets(ZK_CONFIG_PATH),
);

function elapsed(since: number): string {
  return `${((Date.now() - since) / 1000).toFixed(1)}s`;
}

/** Print where a proved call's time actually went — measured, not estimated. */
function printBreakdown(meter: ProvingMeter, callsBefore: number, startedAt: number): void {
  const b = breakdownWindow(meter, callsBefore, startedAt, Date.now());
  if (b) console.log(`  breakdown: ${describeBreakdown(b)}`);
  else console.log('  breakdown: no proving requests observed — the prover was not called via fetch');
}

async function main(): Promise<void> {
  const network = getNetwork();

  if ((process.env.MRA_NETWORK ?? 'localnet') !== 'localnet') {
    throw new Error('localnet-only: uses well-known genesis seeds. Use the faucet on Stagenet.');
  }

  console.log(`network ${network.networkId}`);
  await configureNetworkId(network);

  // Same instrument as the browser UI (packages/network/src/proving-meter.ts),
  // installed before any provider can capture the unpatched fetch.
  const meter = meterProving(network.proofServer);

  const seed = LOCALNET_GENESIS_SEEDS[0];
  console.log(`wallet from genesis seed ${seed.slice(0, 8)}…`);
  const midnightWallet = await createWalletFromSeed(seed, network);

  try {
    console.log('syncing wallet…');
    let t = Date.now();
    await midnightWallet.wallet.waitForSyncedState();
    console.log(`  synced in ${elapsed(t)}`);

    const providers = await createProviders<'increment'>({
      network,
      wallet: midnightWallet,
      zkConfigPath: ZK_CONFIG_PATH,
      privateStateStoreName: 'counter-private-state',
      accountId: `counter-${seed.slice(0, 8)}`,
      privateStatePassword: PRIVATE_STATE_PASSWORD,
    });
    console.log('providers ready');

    console.log('deploying (proving + submitting — expect a minute or more)…');
    t = Date.now();
    let callsBefore = meter.calls().length;
    const deployed = await deployContract(providers, { compiledContract });
    const address = deployed.deployTxData.public.contractAddress;
    console.log(`  deployed in ${elapsed(t)}`);
    printBreakdown(meter, callsBefore, t);
    console.log(`  address ${address}`);

    // Read the initial on-chain state.
    const initial = await providers.publicDataProvider.queryContractState(address);
    console.log(`  initial round = ${initial ? ledger(initial.data).round : '<no state>'}`);

    // Then prove we can interact with it.
    console.log('calling increment()…');
    t = Date.now();
    callsBefore = meter.calls().length;
    const call = await deployed.callTx.increment();
    console.log(`  called in ${elapsed(t)}`);
    printBreakdown(meter, callsBefore, t);
    console.log(`  tx ${call.public.txId} @ block ${call.public.blockHeight}`);

    const after = await providers.publicDataProvider.queryContractState(address);
    console.log(`  round after increment = ${after ? ledger(after.data).round : '<no state>'}`);

    console.log('\nOK — compiled, deployed, proved, submitted, and read back.');
  } finally {
    await midnightWallet.wallet.stop();
  }
}

main().catch((error: unknown) => {
  console.error('\nfailed:', error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
