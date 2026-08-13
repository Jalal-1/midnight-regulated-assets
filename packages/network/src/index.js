/**
 * The ONLY place network endpoints live.
 *
 * A hardcoded URL anywhere else in this repo is a bug. Every app and package
 * imports from here.
 *
 * Note: midnight-js 5.x `NetworkId` is a free-form string, not an enum — so it
 * is typed as a plain string throughout.
 */

/** @typedef {{ networkId: string, node: string, indexer: string, indexerWs: string, proofServer: string }} NetworkConfig */

const env = (key, fallback) => process.env[key] ?? fallback;

/**
 * Localnet. Values must match ops/localnet/docker-compose.yml — that compose
 * file is the source of truth for ports; this mirrors it.
 *
 * TODO(M0): reconcile these against the compose file once it is pinned.
 */
const localnet = {
  networkId: env('MRA_NETWORK_ID', 'undeployed'),
  node: env('MRA_NODE_URL', 'http://localhost:9944'),
  indexer: env('MRA_INDEXER_URL', 'http://localhost:8088/api/v1/graphql'),
  indexerWs: env('MRA_INDEXER_WS', 'ws://localhost:8088/api/v1/graphql/ws'),
  proofServer: env('MRA_PROOF_SERVER_URL', 'http://localhost:6300'),
};

/**
 * Stagenet is TEMPORARY. The 2.x stack is the target; do not build anything
 * that assumes these endpoints are permanent.
 *
 * TODO(M0): fill from the current state-of-stagenet notes.
 */
const stagenet = {
  networkId: env('MRA_NETWORK_ID', 'TestNet'),
  node: env('MRA_NODE_URL', ''),
  indexer: env('MRA_INDEXER_URL', ''),
  indexerWs: env('MRA_INDEXER_WS', ''),
  // The proof server is ALWAYS local, even against a remote node.
  proofServer: env('MRA_PROOF_SERVER_URL', 'http://localhost:6300'),
};

/** @type {Record<string, NetworkConfig>} */
export const networks = { localnet, stagenet };

/**
 * Resolve the active network. Defaults to localnet — this repo is
 * localnet-first by policy, so you must opt in to anything else.
 *
 * @param {string} [name] override; otherwise MRA_NETWORK, else 'localnet'
 * @returns {NetworkConfig}
 */
export function getNetwork(name = env('MRA_NETWORK', 'localnet')) {
  const config = networks[name];
  if (!config) {
    throw new Error(
      `Unknown network "${name}". Known: ${Object.keys(networks).join(', ')}`,
    );
  }
  const missing = Object.entries(config)
    .filter(([, v]) => v === '')
    .map(([k]) => k);
  if (missing.length) {
    throw new Error(
      `Network "${name}" is missing endpoints: ${missing.join(', ')}. ` +
        `Set them via env (MRA_NODE_URL, MRA_INDEXER_URL, …) or fill them in packages/network.`,
    );
  }
  return config;
}
