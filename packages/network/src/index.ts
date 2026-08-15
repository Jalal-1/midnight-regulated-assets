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
  /** Node JSON-RPC over HTTP. */
  node: string;
  /** Node over WebSocket. The wallet SDK's `relayURL` needs this, not the HTTP one. */
  nodeWs: string;
  indexer: string;
  indexerWs: string;
  /**
   * Token faucet for funded test seeds — hosted test networks only; absent on
   * localnet, where genesis seeds are pre-funded and pre-registered for DUST.
   */
  faucet?: string;
  /** Proof server base URL — convenience alias for `proofServerConfig.url`. */
  proofServer: string;
  /**
   * Full proving configuration, including auth headers and timeout. Providers
   * need this, not just the URL. See {@link resolveProofServer}.
   */
  proofServerConfig: ProofServerConfig;
}

/** A network's fixed endpoints. Proving is resolved separately, at call time. */
type NetworkEndpoints = Omit<NetworkConfig, 'proofServer' | 'proofServerConfig'>;

/**
 * How proofs get generated.
 *
 * `local` — the default, and the privacy-preserving case: the proof server runs
 * on the same machine, so witness data never leaves it.
 *
 * `hosted` — a third-party prover, e.g. running in a confidential space (TEE).
 * Witness data DOES leave the machine, so this is only acceptable where the
 * provider's attestation is part of your trust model. Requires an API key.
 */
export type ProofServerKind = 'local' | 'hosted';

export interface ProofServerConfig {
  readonly kind: ProofServerKind;
  readonly url: string;
  /**
   * Headers to send with every proving request, already assembled — pass
   * straight to `httpClientProofProvider`'s config. Empty for `local`.
   */
  readonly headers: Readonly<Record<string, string>>;
  /** Per-request timeout in ms. Hosted provers need more headroom than local. */
  readonly timeoutMs: number;
}

const LOCAL_PROOF_SERVER = 'http://localhost:6300';
const INDEXER_API_VERSION = 'v4';

/** Local proving is fast and predictable; a hosted one adds network and queueing. */
const LOCAL_TIMEOUT_MS = 300_000;
const HOSTED_TIMEOUT_MS = 600_000;

const env = (key: string): string | undefined => {
  const value = process.env[key];
  return value === undefined || value === '' ? undefined : value;
};

/**
 * Resolve where proving happens, from the environment.
 *
 * | Variable | Meaning |
 * |---|---|
 * | `MRA_PROOF_SERVER_URL` | Hosted prover base URL. Absent ⇒ local. |
 * | `MRA_PROOF_SERVER_API_KEY` | Required when the URL is set. |
 * | `MRA_PROOF_SERVER_AUTH_HEADER` | Header name. Default `Authorization`. |
 * | `MRA_PROOF_SERVER_AUTH_SCHEME` | Prefix for the value. Default `Bearer`. Set empty for a bare key. |
 * | `MRA_PROOF_SERVER_TIMEOUT_MS` | Override the request timeout. |
 *
 * Two guardrails, both deliberate:
 *
 * 1. **A hosted prover must be `https`.** Sending an API key — and witness data
 *    — over plaintext is not a warning-level mistake, so it throws. `localhost`
 *    is exempt, for testing a prover running locally.
 * 2. **The API key is mandatory when a hosted URL is set.** Silently falling
 *    back to unauthenticated requests would surface as a confusing 401 mid-proof.
 *
 * Never log the result of this function directly — use {@link describeProofServer}.
 */
export function resolveProofServer(): ProofServerConfig {
  const url = env('MRA_PROOF_SERVER_URL');

  if (url === undefined) {
    return {
      kind: 'local',
      url: LOCAL_PROOF_SERVER,
      headers: {},
      timeoutMs: Number(env('MRA_PROOF_SERVER_TIMEOUT_MS') ?? LOCAL_TIMEOUT_MS),
    };
  }

  const parsed = new URL(url);
  const isLoopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !isLoopback) {
    throw new Error(
      `A hosted proof server must use https (got ${parsed.protocol}//${parsed.hostname}). ` +
        `Proving sends witness data and an API key; neither may cross a plaintext connection.`,
    );
  }

  const apiKey = env('MRA_PROOF_SERVER_API_KEY');
  if (apiKey === undefined) {
    throw new Error(
      'MRA_PROOF_SERVER_URL is set but MRA_PROOF_SERVER_API_KEY is not. ' +
        'A hosted proof server requires a key; unset the URL to prove locally instead.',
    );
  }

  const header = env('MRA_PROOF_SERVER_AUTH_HEADER') ?? 'Authorization';
  // Deliberately allows an empty scheme, for providers wanting a bare key.
  const scheme = process.env.MRA_PROOF_SERVER_AUTH_SCHEME ?? 'Bearer';

  return {
    kind: 'hosted',
    url,
    headers: { [header]: scheme ? `${scheme} ${apiKey}` : apiKey },
    timeoutMs: Number(env('MRA_PROOF_SERVER_TIMEOUT_MS') ?? HOSTED_TIMEOUT_MS),
  };
}

/** Log-safe description. Never renders the API key. */
export function describeProofServer(config: ProofServerConfig): string {
  if (config.kind === 'local') return `local (${config.url})`;
  const names = Object.keys(config.headers).join(', ');
  return `hosted (${config.url}) authenticated via ${names || 'no headers'} [key redacted]`;
}

const indexerPaths = (host: string) => ({
  indexer: `http://${host}/api/${INDEXER_API_VERSION}/graphql`,
  indexerWs: `ws://${host}/api/${INDEXER_API_VERSION}/graphql/ws`,
});

/** Localnet. Ports must match ops/localnet/compose.yml. */
const localnet: NetworkEndpoints = {
  networkId: 'undeployed',
  node: 'http://localhost:9944',
  nodeWs: 'ws://localhost:9944',
  ...indexerPaths('localhost:8088'),
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
const stagenet: NetworkEndpoints = {
  // 'stagenet' is the wallet SDK's own NetworkId.StageNet value, so it is the
  // string both SDKs agree on (verified against a live Stagenet sync 2026-08-15).
  networkId: process.env.MRA_NETWORK_ID ?? 'stagenet',
  // The faucet is Turnstile-gated and does NOT accept an address query param
  // (probed 2026-08-16: address/addr/to/recipient/wallet all ignored) — callers
  // should copy the address for the user and open this URL.
  faucet: 'https://faucet.stagenet.shielded.tools',
  node: 'https://rpc.stagenet.shielded.tools',
  nodeWs: 'wss://rpc.stagenet.shielded.tools',
  indexer: `https://indexer.stagenet.shielded.tools/api/${INDEXER_API_VERSION}/graphql`,
  indexerWs: `wss://indexer.stagenet.shielded.tools/api/${INDEXER_API_VERSION}/graphql/ws`,
};

export const networks = { localnet, stagenet } satisfies Record<string, NetworkEndpoints>;

export type NetworkName = keyof typeof networks;

/**
 * CAUTION: there are TWO network-id concepts, and they are not interchangeable.
 *
 *   midnight-js   `NetworkId` = plain string, e.g. 'undeployed'
 *   wallet-sdk    `NetworkId.NetworkId` = an enum, e.g. NetworkId.Undeployed
 *
 * Both must be set, from the same source of truth, or the wallet and the
 * contract layer will disagree about which chain they are on. `networkId` above
 * is the midnight-js string; map it to the wallet-sdk enum at the wallet
 * boundary (see packages/wallet), never by parsing the string twice.
 */

/**
 * Seeds pre-funded by the localnet genesis mint (`CFG_PRESET=dev`).
 *
 * Localnet only — these are public, well-known test keys. Never use them
 * anywhere else, and never add a Stagenet seed to this file: use the faucet.
 *
 * Taken from midnight-js testkit's LocalTestEnvironment, which caps usage at 4
 * wallets. Note the upstream order really does start at ...0002.
 */
export const LOCALNET_GENESIS_SEEDS = [
  '0000000000000000000000000000000000000000000000000000000000000002',
  '0000000000000000000000000000000000000000000000000000000000000001',
  '0000000000000000000000000000000000000000000000000000000000000003',
  '0000000000000000000000000000000000000000000000000000000000000004',
] as const;

/**
 * Resolve the active network. Defaults to localnet: this repo is localnet-first
 * by policy, so anything remote is opt-in via MRA_NETWORK=stagenet.
 *
 * Proving configuration is resolved here rather than baked into the network
 * constants, so a bad proof-server setup fails when someone asks for a network —
 * not at import time, in whatever module happened to load first.
 *
 * Remember: midnight-js keeps the network ID in module-level global state, so
 * `setNetworkId(getNetwork().networkId)` must run before ANY wallet or contract
 * operation, or the SDK throws. See packages/wallet.
 *
 * @throws if the network name is unknown, or the proof-server config is invalid.
 */
export function getNetwork(name: string = process.env.MRA_NETWORK ?? 'localnet'): NetworkConfig {
  const endpoints = networks[name as NetworkName];
  if (!endpoints) {
    throw new Error(`Unknown network "${name}". Known: ${Object.keys(networks).join(', ')}`);
  }
  const proofServerConfig = resolveProofServer();
  return { ...endpoints, proofServer: proofServerConfig.url, proofServerConfig };
}

export * from './proving-meter.ts';
