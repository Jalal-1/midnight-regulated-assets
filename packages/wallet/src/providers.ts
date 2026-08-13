/**
 * Assembles the six providers midnight-js needs for a contract transaction.
 *
 * Four are plain infrastructure (indexer, proof server, ZK artifacts, private
 * state). The interesting two are the wallet bridge: midnight-js wants a
 * `WalletProvider` and a `MidnightProvider`, and the wallet SDK implements
 * neither — the shapes do not line up, so this adapts them.
 */

import {
  ShieldedCoinPublicKey,
  ShieldedEncryptionPublicKey,
} from '@midnightntwrk/wallet-sdk-address-format';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import type { MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import type { NetworkConfig } from '@mra/network';

import type { MidnightWallet } from './index.ts';

/** How long a balancing transaction stays valid. Generous, because proving is slow. */
const DEFAULT_TTL_MS = 15 * 60 * 1000;

export interface ProviderOptions {
  readonly network: NetworkConfig;
  /** Must already be started and synced. */
  readonly wallet: MidnightWallet;
  /**
   * The compiler's output directory — the one containing `keys/`, `zkir/` and
   * `compiler/`. For the counter that is `apps/counter/contract/managed`.
   */
  readonly zkConfigPath: string;
  /** LevelDB object-store name for this contract's private state. */
  readonly privateStateStoreName: string;
  /**
   * Scopes stored private state to one account, so two wallets sharing a machine
   * do not read each other's state. Any stable string per wallet.
   */
  readonly accountId: string;
  /**
   * Password encrypting private state at rest. Must satisfy midnight-js's policy:
   * 16+ characters, at least 3 of upper/lower/digit/special, and no more than 3
   * identical characters in a row.
   *
   * Private state encryption is not optional in 5.x — there is no plaintext mode.
   */
  readonly privateStatePassword: string;
}

/**
 * Build the provider set for one contract.
 *
 * On the two adapters:
 *
 * - **`balanceTx`** is the awkward one. midnight-js expects a single call that
 *   returns a finalized transaction. The wallet SDK splits that in two:
 *   balancing returns a *recipe* (base plus an optional balancing transaction),
 *   and `finalizeRecipe` turns a recipe into a finalized transaction. So this
 *   does both in order and returns only what midnight-js asked for.
 *
 * - **`getCoinPublicKey` / `getEncryptionPublicKey`** read the synced shielded
 *   state, which is why the wallet must be synced before providers exist.
 *
 * The cast at the return is deliberate and narrow: the two SDKs describe the
 * same transaction values through separately-generated types, so they are
 * structurally compatible but not nominally identical. Everything above the cast
 * is fully typed; if you change an adapter, check it by running a deploy, not by
 * trusting tsc here.
 */
export async function createProviders<
  /** Union of the contract's circuit names, e.g. `'increment'`. */
  PCK extends string = string,
  PSI extends string = string,
  PS = unknown,
>(options: ProviderOptions): Promise<MidnightProviders<PCK, PSI, PS>> {
  const { network, zkConfigPath, privateStateStoreName, accountId, privateStatePassword } = options;
  const { wallet, shieldedSecretKeys, dustSecretKey } = options.wallet;

  const state = await wallet.waitForSyncedState();
  const secretKeys = { shieldedSecretKeys, dustSecretKey };

  // midnight-js wants these as bech32m STRINGS; the wallet SDK hands back
  // ShieldedCoinPublicKey / ShieldedEncryptionPublicKey objects whose toString()
  // is "[object Object]". Passing them raw fails deep inside deploy with
  // "bech32.decode input: string expected".
  //
  // Encode via each class's *static* `codec`. `MidnightBech32m.encode(id, item)`
  // looks the codec up on the instance (`item[Bech32mSymbol]`), and these two
  // classes only carry it statically, so that route throws.
  const walletProvider = {
    getCoinPublicKey: () =>
      ShieldedCoinPublicKey.codec.encode(network.networkId, state.shielded.coinPublicKey).asString(),
    getEncryptionPublicKey: () =>
      ShieldedEncryptionPublicKey.codec
        .encode(network.networkId, state.shielded.encryptionPublicKey)
        .asString(),
    balanceTx: async (
      tx: Parameters<typeof wallet.balanceUnboundTransaction>[0],
      ttl?: Date,
    ) => {
      const recipe = await wallet.balanceUnboundTransaction(tx, secretKeys, {
        ttl: ttl ?? new Date(Date.now() + DEFAULT_TTL_MS),
      });
      return wallet.finalizeRecipe(recipe);
    },
  };

  const midnightProvider = {
    submitTx: (tx: Parameters<typeof wallet.submitTransaction>[0]) => wallet.submitTransaction(tx),
  };

  // The proof provider needs the ZK config provider: it looks up proving keys by
  // location while proving, so it cannot be constructed independently.
  const zkConfigProvider = new NodeZkConfigProvider(zkConfigPath);

  return {
    publicDataProvider: indexerPublicDataProvider(network.indexer, network.indexerWs),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(network.proofServer, zkConfigProvider),
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName,
      accountId,
      privateStoragePasswordProvider: () => privateStatePassword,
    }),
    walletProvider,
    midnightProvider,
  } as unknown as MidnightProviders<PCK, PSI, PS>;
}
