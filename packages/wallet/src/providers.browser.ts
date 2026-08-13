/**
 * Browser variant of the provider set.
 *
 * Two providers cannot cross into the browser and are swapped here; the other
 * four, and both wallet adapters, are identical to the Node path:
 *
 *   zkConfigProvider     NodeZkConfigProvider reads proving keys off disk.
 *                        In a browser they must be fetched over HTTP, so the
 *                        compiler's `managed/` directory is served as static
 *                        assets and fetched from `zkConfigBaseUrl`.
 *
 *   privateStateProvider classic-level is a native LevelDB binding. The browser
 *                        uses IndexedDB via browser-level, injected through the
 *                        provider's `levelFactory` hook.
 *
 * Everything else — including proving — genuinely runs client-side. The proof
 * server stays local: it is reached from the page at localhost:6300, and it sends
 * permissive CORS headers, so no proxy is required.
 */

import { BrowserLevel } from 'browser-level';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import type { MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import {
  ShieldedCoinPublicKey,
  ShieldedEncryptionPublicKey,
} from '@midnightntwrk/wallet-sdk-address-format';
import type { NetworkConfig } from '@mra/network';

import type { MidnightWallet } from './index.ts';

const DEFAULT_TTL_MS = 15 * 60 * 1000;

export interface BrowserProviderOptions {
  readonly network: NetworkConfig;
  /** Must already be started and synced. */
  readonly wallet: MidnightWallet;
  /**
   * URL serving the compiler's `managed/` directory, so that
   * `${zkConfigBaseUrl}/keys/increment.prover` resolves.
   */
  readonly zkConfigBaseUrl: string;
  readonly privateStateStoreName: string;
  readonly accountId: string;
  readonly privateStatePassword: string;
}

/** See `providers.ts` for why each adapter looks the way it does. */
export async function createBrowserProviders<
  PCK extends string = string,
  PSI extends string = string,
  PS = unknown,
>(options: BrowserProviderOptions): Promise<MidnightProviders<PCK, PSI, PS>> {
  const { network, zkConfigBaseUrl, privateStateStoreName, accountId, privateStatePassword } =
    options;
  const { wallet, shieldedSecretKeys, dustSecretKey } = options.wallet;

  const state = await wallet.waitForSyncedState();
  const secretKeys = { shieldedSecretKeys, dustSecretKey };

  const walletProvider = {
    // Bech32m strings, via each class's static codec — not the objects.
    getCoinPublicKey: () =>
      ShieldedCoinPublicKey.codec.encode(network.networkId, state.shielded.coinPublicKey).asString(),
    getEncryptionPublicKey: () =>
      ShieldedEncryptionPublicKey.codec
        .encode(network.networkId, state.shielded.encryptionPublicKey)
        .asString(),
    // Balance, then finalise: midnight-js wants one step, the SDK gives two.
    balanceTx: async (tx: Parameters<typeof wallet.balanceUnboundTransaction>[0], ttl?: Date) => {
      const recipe = await wallet.balanceUnboundTransaction(tx, secretKeys, {
        ttl: ttl ?? new Date(Date.now() + DEFAULT_TTL_MS),
      });
      return wallet.finalizeRecipe(recipe);
    },
  };

  const midnightProvider = {
    submitTx: (tx: Parameters<typeof wallet.submitTransaction>[0]) => wallet.submitTransaction(tx),
  };

  // Second arg is an OPTIONS OBJECT, not a fetch function — passing a bare
  // fetch silently lands in `integrityOptions` and the provider falls back to
  // global fetch anyway.
  const zkConfigProvider = new FetchZkConfigProvider<PCK>(zkConfigBaseUrl, {
    fetchFunc: fetch.bind(globalThis),
  });

  return {
    publicDataProvider: indexerPublicDataProvider(network.indexer, network.indexerWs),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(network.proofServer, zkConfigProvider),
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName,
      accountId,
      privateStoragePasswordProvider: () => privateStatePassword,
      levelFactory: (dbName: string) => new BrowserLevel(dbName) as never,
    }),
    walletProvider,
    midnightProvider,
  } as unknown as MidnightProviders<PCK, PSI, PS>;
}
