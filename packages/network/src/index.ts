/**
 * The ONLY place network endpoints live.
 *
 * A hardcoded URL anywhere else in this repo is a bug. Every app and package
 * imports from here.
 *
 * Verified against midnight-context (snapshot 2026-08-04):
 *   node          9944   ghcr.io/midnight-ntwrk/midnight-node
 *   indexer       8088   ghcr.io/midnight-ntwrk/indexer-standalone
 *   proof server  6300   ghcr.io/midnight-ntwrk/proof-server
 *
 * The indexer GraphQL path is version-scoped and moves with the indexer image
 * (v3 → v4 between 4.0.x and 4.3.x). It is derived from INDEXER_API_VERSION
 * rather than hardcoded, because getting it wrong fails as an opaque 404.
 */

/** Endpoints for one network. */
export interface NetworkConfig {
  /**
   * midnight-js 5.x types NetworkId as a plain `string`, not an enum
   * (packages/network-id/src/network-id.ts: `export type NetworkId = string`).
   * Localnet is 'undeployed' — this must match the indexer's
   * APP__APPLICATION__NETWORK_ID or sync silently returns nothing.
   */
  networkId: string;
  node: string;
  indexer: string;
  indexerWs: string;
  /** Always local, even against a remote node. */
  proofServer: string;
}

const PROOF_SERVER = 'http://localhost:6300';
const INDEXER_API_VERSION = 'v4';

const indexerPaths = (host: string) => ({
  indexer: `http://${host}/api/${INDEXER_API_VERSION}/graphql`,
  indexerWs: `ws://${host}/api/${INDEXER_API_VERSION}/graphql/ws`,
});

/** Localnet. Ports must match ops/localnet/compose.yml. */
const localnet: NetworkConfig = {
  networkId: 'undeployed',
  node: 'http://localhost:9944',
  ...indexerPaths('localhost:8088'),
  proofServer: PROOF_SERVER,
};

/**
 * Stagenet — the deployment target.
 *
 * A brand-new chain with its own genesis, publicly reachable over TLS. Endpoints
 * are preserved across resets, so these are stable; chain STATE is not. A reset
 * wipes balances and contracts: resync wallets, re-request faucet funds, redeploy.
 *
 * Faucet: https://faucet.stagenet.shielded.tools
 */
const stagenet: NetworkConfig = {
  // Not documented in the delivery note. Override until confirmed.
  networkId: process.env.MRA_NETWORK_ID ?? 'undeployed',
  node: 'wss://rpc.stagenet.shielded.tools',
  indexer: `https://indexer.stagenet.shielded.tools/api/${INDEXER_API_VERSION}/graphql`,
  indexerWs: `wss://indexer.stagenet.shielded.tools/api/${INDEXER_API_VERSION}/graphql/ws`,
  // Local even here: proofs are generated client-side and never leave the machine.
  proofServer: PROOF_SERVER,
};

export const networks = { localnet, stagenet } satisfies Record<string, NetworkConfig>;

export type NetworkName = keyof typeof networks;

/**
 * Resolve the active network. Defaults to localnet: this repo is localnet-first
 * by policy, so anything remote is opt-in via MRA_NETWORK=stagenet.
 *
 * Remember: midnight-js keeps the network ID in module-level global state, so
 * `setNetworkId(getNetwork().networkId)` must run before ANY wallet or contract
 * operation, or the SDK throws. See packages/wallet.
 *
 * @throws if the network name is unknown.
 */
export function getNetwork(name: string = process.env.MRA_NETWORK ?? 'localnet'): NetworkConfig {
  const config = networks[name as NetworkName];
  if (!config) {
    throw new Error(`Unknown network "${name}". Known: ${Object.keys(networks).join(', ')}`);
  }
  return config;
}
