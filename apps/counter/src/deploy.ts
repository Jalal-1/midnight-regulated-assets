/**
 * Counter deploy — the toolchain proof.
 *
 * This is not a product. It answers one question: does the pinned stack
 * compile, deploy, prove, and submit end to end? If this fails, nothing
 * downstream is worth debugging.
 *
 * Run:  yarn node --experimental-strip-types apps/counter/src/deploy.ts
 * Needs: a running localnet (`yarn localnet:up`) and a compiled contract
 *        (`yarn redeploy`).
 */

import { getNetwork, LOCALNET_GENESIS_SEEDS } from '@mra/network';

/**
 * The single `setNetworkId` call site for this app.
 *
 * midnight-js keeps the network ID in module-level global state and throws from
 * `getNetworkId()` if it was never set, so this must run before any wallet or
 * contract operation. The wallet SDK has its own separate enum — see the
 * two-NetworkId note in docs/field-notes.md.
 */
async function configureNetwork(): Promise<void> {
  const { setNetworkId } = await import('@midnight-ntwrk/midnight-js-network-id');
  setNetworkId(getNetwork().networkId);
}

async function main(): Promise<void> {
  const network = getNetwork();

  console.log('network     ', process.env.MRA_NETWORK ?? 'localnet');
  console.log('networkId   ', network.networkId);
  console.log('node        ', network.node);
  console.log('indexer     ', network.indexer);
  console.log('proof server', network.proofServer);

  await configureNetwork();
  console.log('\nnetwork id set');

  // Localnet only. On Stagenet this must come from the faucet, never from here.
  if (process.env.MRA_NETWORK && process.env.MRA_NETWORK !== 'localnet') {
    throw new Error(
      'This proof script is localnet-only: it uses the well-known genesis seeds. ' +
        'Fund a Stagenet wallet from the faucet instead.',
    );
  }
  const seed = LOCALNET_GENESIS_SEEDS[0];
  console.log(`using genesis seed ${seed.slice(0, 8)}…`);

  // TODO(M1): build the wallet, assemble MidnightProviders, and deployContract.
  //
  // Providers still to wire (all installed at 5.0.0-beta.4):
  //   publicDataProvider   indexer-public-data-provider  (network.indexer, indexerWs)
  //   proofProvider        http-client-proof-provider    (network.proofServer)
  //   zkConfigProvider     node-zk-config-provider       (contract/managed)
  //   privateStateProvider level-private-state-provider   (local LevelDB)
  //   walletProvider + midnightProvider  from the wallet SDK
  //
  // Then: deployContract(providers, { compiledContract }) and call increment().
  throw new Error('deploy not implemented yet — providers not wired (M1)');
}

main().catch((error: unknown) => {
  console.error('\nfailed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
