/**
 * Thin wrapper over the Midnight Wallet SDK.
 *
 * Thin is the point: this owns the awkward wiring the SDK requires and nothing
 * else. No abstraction that hides SDK semantics. There is no Lace on the 2.x
 * line, so every wallet here is programmatic.
 *
 * Two pieces of required global wiring live here, and only here:
 *
 *   1. `setNetworkId()` — midnight-js keeps the network ID in module-level
 *      state and throws from `getNetworkId()` if it was never set.
 *   2. The wallet SDK's own `NetworkId` enum, which is a different type from
 *      midnight-js's free-form string. Both must come from one source.
 */

import {
  createKeystore,
  DustAddress,
  DustWallet,
  HDWallet,
  InMemoryTransactionHistoryStorage,
  mergeWalletEntries,
  NetworkId,
  PublicKey,
  Roles,
  ShieldedAddress,
  ShieldedWallet,
  UnshieldedAddress,
  UnshieldedWallet,
  WalletEntrySchema,
  WalletFacade,
  type DefaultConfiguration,
} from '@midnightntwrk/wallet-sdk';
import { DustSecretKey, LedgerParameters, ZswapSecretKeys } from '@midnightntwrk/ledger-v9';
import { getNetwork, type NetworkConfig } from '@mra/network';

/**
 * Map our network-id string onto the wallet SDK's enum.
 *
 * These are two distinct types over the same concept; the enum's values happen
 * to be the same lowercase strings, but relying on that coincidence is how the
 * two layers end up on different chains. Convert explicitly, fail loudly.
 */
export function toWalletNetworkId(networkId: string): NetworkId.NetworkId {
  const match = Object.values(NetworkId.NetworkId).find((value) => value === networkId);
  if (!match) {
    throw new Error(
      `No wallet SDK NetworkId matches "${networkId}". ` +
        `Known: ${Object.values(NetworkId.NetworkId).join(', ')}`,
    );
  }
  return match;
}

/**
 * The single `setNetworkId` call site for this repo.
 *
 * Call once, before any wallet or contract operation. Safe to call repeatedly
 * with the same network; calling it with a different one mid-process is a bug
 * the SDK cannot detect for you.
 */
export async function configureNetworkId(network: NetworkConfig = getNetwork()): Promise<string> {
  const { setNetworkId } = await import('@midnight-ntwrk/midnight-js-network-id');
  setNetworkId(network.networkId);
  return network.networkId;
}

/** The three wallet addresses, as displayable bech32m strings. */
export interface WalletAddresses {
  readonly shielded: string;
  readonly unshielded: string;
  readonly dust: string;
}

/**
 * Encode the synced state's address objects as bech32m strings.
 *
 * The SDK's address types (`ShieldedAddress` etc.) do not stringify — their
 * `toString()` is `[object Object]` — and the working encoder is the STATIC
 * `codec` on each class, exactly like the public-key codecs in providers.ts.
 * Instance-level `MidnightBech32m.encode` throws; do not "simplify" back to it.
 */
export function encodeWalletAddresses(
  state: {
    readonly shielded: { readonly address: ShieldedAddress };
    readonly unshielded: { readonly address: UnshieldedAddress };
    readonly dust: { readonly address: DustAddress };
  },
  network: NetworkConfig = getNetwork(),
): WalletAddresses {
  const networkId = toWalletNetworkId(network.networkId);
  return {
    shielded: ShieldedAddress.codec.encode(networkId, state.shielded.address).asString(),
    unshielded: UnshieldedAddress.codec.encode(networkId, state.unshielded.address).asString(),
    dust: DustAddress.codec.encode(networkId, state.dust.address).asString(),
  };
}

/** Everything a caller needs after building a wallet. */
export interface MidnightWallet {
  readonly wallet: WalletFacade;
  readonly shieldedSecretKeys: ZswapSecretKeys;
  readonly dustSecretKey: DustSecretKey;
}

function buildConfiguration(network: NetworkConfig): DefaultConfiguration {
  return {
    networkId: network.networkId,
    costParameters: { feeBlocksMargin: 5 },
    // relayURL must be the WebSocket endpoint, not the HTTP one.
    relayURL: new URL(network.nodeWs),
    provingServerUrl: new URL(network.proofServer),
    indexerClientConnection: {
      indexerHttpUrl: network.indexer,
      indexerWsUrl: network.indexerWs,
    },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema, mergeWalletEntries),
  };
}

/**
 * Build and start a wallet from a hex seed.
 *
 * Derives the three roles the stack needs — Zswap (shielded), NightExternal
 * (unshielded), and Dust (fees) — from account 0, index 0. DUST matters: without
 * that role the wallet cannot pay for anything it submits.
 *
 * The HD wallet's key material is cleared as soon as the three secret keys are
 * derived, matching upstream's own initialisation sequence.
 *
 * @param seedHex 64 hex characters. On localnet use LOCALNET_GENESIS_SEEDS;
 *                on Stagenet use a faucet-funded seed supplied at runtime.
 */
export async function createWalletFromSeed(
  seedHex: string,
  network: NetworkConfig = getNetwork(),
): Promise<MidnightWallet> {
  if (!/^[0-9a-f]{64}$/i.test(seedHex)) {
    throw new Error('seed must be 64 hex characters');
  }

  const hd = HDWallet.fromSeed(Buffer.from(seedHex, 'hex'));
  if (hd.type !== 'seedOk') {
    throw new Error(`HDWallet.fromSeed failed: ${hd.type}`);
  }

  const derived = hd.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  if (derived.type !== 'keysDerived') {
    throw new Error(`key derivation failed: ${derived.type}`);
  }
  hd.hdWallet.clear();

  const shieldedSecretKeys = ZswapSecretKeys.fromSeed(derived.keys[Roles.Zswap]);
  const dustSecretKey = DustSecretKey.fromSeed(derived.keys[Roles.Dust]);

  // Note the shape: wallet-sdk 2.0.0-beta.2 wants a tagged {kind, secret} and
  // the NetworkId *enum*. Older examples pass a bare seed and a plain string —
  // those predate this signature. 'schnorr' is the unshielded default; 'ecdsa'
  // is the other option and is what custody multisig will need.
  const keystore = createKeystore(
    { kind: 'schnorr', secret: derived.keys[Roles.NightExternal] },
    toWalletNetworkId(network.networkId),
  );

  const configuration = buildConfiguration(network);
  const wallet = await WalletFacade.init({
    configuration,
    shielded: (config) => ShieldedWallet(config).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (config) =>
      UnshieldedWallet(config).startWithPublicKey(PublicKey.fromKeyStore(keystore)),
    dust: (config) =>
      DustWallet(config).startWithSecretKey(
        dustSecretKey,
        LedgerParameters.initialParameters().dust,
      ),
  });

  await wallet.start(shieldedSecretKeys, dustSecretKey);

  return { wallet, shieldedSecretKeys, dustSecretKey };
}
