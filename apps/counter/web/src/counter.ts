/**
 * All the chain interaction for the counter UI, kept out of the React layer.
 *
 * Deliberately mirrors apps/counter/src/deploy.ts, which is the Node version of
 * the same sequence. If the two ever disagree, the Node script is the reference:
 * it is the toolchain proof.
 */

import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import type { MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import { getNetwork, LOCALNET_GENESIS_SEEDS } from '@mra/network';
import {
  configureNetworkId,
  createWalletFromSeed,
  encodeWalletAddresses,
  type MidnightWallet,
} from '@mra/wallet';
import { createBrowserProviders } from '@mra/wallet/providers/browser';

import { Contract, ledger } from '../../contract/managed/contract/index.js';

/** Served by Vite from web/public/managed — see vite.config.ts. */
const ZK_CONFIG_BASE_URL = `${globalThis.location.origin}/managed`;

const PRIVATE_STATE_PASSWORD = 'Localnet-Dev-Pw-2026!';

export type CircuitId = 'increment';

const compiledContract = CompiledContract.make('counter', Contract).pipe(
  CompiledContract.withVacantWitnesses,
  // Relative, because assets are fetched from the served base URL, not from disk.
  CompiledContract.withCompiledFileAssets(''),
);

export interface Session {
  readonly wallet: MidnightWallet;
  readonly providers: MidnightProviders<CircuitId>;
  readonly shieldedAddress: string;
  readonly shieldedBalance: bigint;
  readonly unshieldedAddress: string;
  readonly unshieldedBalance: bigint;
  readonly dustAddress: string;
  /** Spendable DUST coins — the wallet reports coins, not one balance. */
  readonly dustCoins: number;
}

/**
 * Build a wallet and providers entirely in the browser.
 *
 * Localnet only: it uses the public genesis seeds. Stagenet needs a faucet-funded
 * seed, which must never be hardcoded here.
 */
export async function connect(seedIndex = 0): Promise<Session> {
  const network = getNetwork();
  await configureNetworkId(network);

  const seed = LOCALNET_GENESIS_SEEDS[seedIndex] ?? LOCALNET_GENESIS_SEEDS[0]!;
  const wallet = await createWalletFromSeed(seed, network);
  const state = await wallet.wallet.waitForSyncedState();

  const providers = await createBrowserProviders<CircuitId>({
    network,
    wallet,
    zkConfigBaseUrl: ZK_CONFIG_BASE_URL,
    privateStateStoreName: 'counter-private-state',
    accountId: `counter-${seed.slice(0, 8)}`,
    privateStatePassword: PRIVATE_STATE_PASSWORD,
  });

  const nativeToken = '0'.repeat(64);
  const addresses = encodeWalletAddresses(state, network);
  return {
    wallet,
    providers,
    shieldedAddress: addresses.shielded,
    shieldedBalance: BigInt(state.shielded.balances?.[nativeToken] ?? 0n),
    unshieldedAddress: addresses.unshielded,
    unshieldedBalance: BigInt(state.unshielded.balances?.[nativeToken] ?? 0n),
    dustAddress: addresses.dust,
    dustCoins: state.dust.availableCoins?.length ?? 0,
  };
}

/** Deploy a fresh counter. Returns its address. */
export async function deploy(session: Session): Promise<string> {
  const deployed = await deployContract(session.providers, { compiledContract });
  return deployed.deployTxData.public.contractAddress;
}

/** Read the public `round` value straight from the indexer. */
export async function readRound(session: Session, address: string): Promise<bigint | null> {
  const state = await session.providers.publicDataProvider.queryContractState(address);
  return state ? BigInt(ledger(state.data).round) : null;
}

/** Call increment() on an existing contract. Proves client-side, then submits. */
export async function increment(
  session: Session,
  address: string,
): Promise<{ txId: string; blockHeight: number }> {
  const found = await findDeployedContract(session.providers, {
    contractAddress: address,
    compiledContract,
  });
  const call = await found.callTx.increment();
  return { txId: call.public.txId, blockHeight: call.public.blockHeight };
}
