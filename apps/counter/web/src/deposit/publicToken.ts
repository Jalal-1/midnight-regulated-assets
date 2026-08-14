/**
 * Browser chain-interaction for the public-token design option.
 *
 * Mirrors apps/tokenised-deposit/src/design-options/public-token.ts (the Node
 * reference — if the two disagree, that one is right). Same contract, same
 * witness identity scheme, same deterministic key derivation, so an account
 * seen from the CLI and from this page is the same account.
 *
 * NOTHING here is mocked: deploys, mints, transfers, and burns are real proved
 * transactions on the local chain, and every read in the public view is
 * decoded from real indexer state.
 */

import {
  CompactTypeBytes,
  CompactTypeVector,
  persistentHash,
  type WitnessContext,
} from '@midnight-ntwrk/compact-runtime';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import type { MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import {
  Contract,
  ledger,
  type ContractAddress,
  type Either,
  type Ledger,
} from '@mra/app-tokenised-deposit/contract';
import { getNetwork, LOCALNET_GENESIS_SEEDS } from '@mra/network';
import { configureNetworkId, createWalletFromSeed, type MidnightWallet } from '@mra/wallet';
import { createBrowserProviders } from '@mra/wallet/providers/browser';

/** Served by Vite from web/public/managed-token — a symlink to the compiled contract. */
const ZK_CONFIG_BASE_URL = `${globalThis.location.origin}/managed-token`;

const PRIVATE_STATE_PASSWORD = 'Localnet-Dev-Pw-2026!';

export type CircuitId = 'mint' | 'burn' | 'transfer' | 'balanceOf' | 'totalSupply' | 'owner';

export type Account = Either<Uint8Array, ContractAddress>;

// --- Personas -------------------------------------------------------------------
//
// Meridian (issuer) and Alice submit transactions, so they get funded wallets
// from the localnet genesis seeds. Bob receives without a wallet — a recipient
// is just an account id. Eve reads without so much as a key.

export const TOKEN_PERSONAS = {
  meridian: { label: 'Meridian', seedIndex: 0 },
  alice: { label: 'Alice', seedIndex: 1 },
} as const;

export type TokenPersona = keyof typeof TOKEN_PERSONAS;

/**
 * A persona's token secret key — sha256 over a domain-separated string,
 * byte-identical to the Node script's derivation so identities line up.
 */
async function tokenSecretKey(seedOrLabel: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(`mra:public-token:sk:${seedOrLabel}`);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

/** accountId = persistentHash(secretKey) — must match OZ Utils.computeAccountId. */
function accountId(secretKey: Uint8Array): Uint8Array {
  return persistentHash(new CompactTypeVector(1, new CompactTypeBytes(32)), [secretKey]);
}

export function asAccount(id: Uint8Array): Account {
  return { is_left: true, left: id, right: { bytes: new Uint8Array(32) } };
}

export const hex = (bytes: Uint8Array): string => {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
};

/** The demo cast's identities, derivable with no chain interaction at all. */
export async function tokenIdentities() {
  const meridianSk = await tokenSecretKey(LOCALNET_GENESIS_SEEDS[TOKEN_PERSONAS.meridian.seedIndex]!);
  const aliceSk = await tokenSecretKey(LOCALNET_GENESIS_SEEDS[TOKEN_PERSONAS.alice.seedIndex]!);
  const bobSk = await tokenSecretKey('bob-needs-no-wallet-to-receive');
  return {
    keys: { meridian: meridianSk, alice: aliceSk, bob: bobSk },
    ids: {
      meridian: asAccount(accountId(meridianSk)),
      alice: asAccount(accountId(aliceSk)),
      bob: asAccount(accountId(bobSk)),
    },
  };
}

function witnessesFor(secretKey: Uint8Array) {
  return {
    wit_OwnableSK: ({ privateState }: WitnessContext<Ledger, undefined>) =>
      [privateState, secretKey] as [undefined, Uint8Array],
    wit_FungibleTokenSK: ({ privateState }: WitnessContext<Ledger, undefined>) =>
      [privateState, secretKey] as [undefined, Uint8Array],
  };
}

function compiledFor(secretKey: Uint8Array) {
  return CompiledContract.make('public-token', Contract).pipe(
    CompiledContract.withWitnesses(witnessesFor(secretKey)),
    // Relative, because assets are fetched from the served base URL, not from disk.
    CompiledContract.withCompiledFileAssets(''),
  );
}

export interface TokenSession {
  readonly persona: TokenPersona;
  readonly wallet: MidnightWallet;
  readonly providers: MidnightProviders<CircuitId>;
  readonly secretKey: Uint8Array;
  /** NIGHT, in stars. */
  readonly unshieldedBalance: bigint;
  /** DUST in specks, computed for the asked-about moment (it generates/decays). */
  readonly dustBalance: (time: Date) => bigint;
}

/** Current best block height, straight from the node. */
async function bestBlock(node: string): Promise<number> {
  const response = await fetch(node, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'chain_getHeader', params: [] }),
  });
  const { result } = await response.json();
  return Number.parseInt(result.number, 16);
}

/**
 * Wait for the chain to advance one block.
 *
 * A freshly started wallet can submit its own DUST-registration transaction.
 * Balancing a deploy while that is still in the mempool selects the same DUST
 * coin twice, and the node rejects the second spend ("DustDoubleSpend"). One
 * block of patience after wallet start removes the race — measured, not
 * assumed: the rejection is in the node log without this wait.
 */
async function waitForNextBlock(node: string): Promise<void> {
  const start = await bestBlock(node);
  for (let i = 0; i < 40; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if ((await bestBlock(node)) > start) return;
  }
}

/** Build a persona's wallet and providers. Localnet only: public genesis seeds. */
export async function connectPersona(persona: TokenPersona): Promise<TokenSession> {
  const network = getNetwork();
  await configureNetworkId(network);

  const seed = LOCALNET_GENESIS_SEEDS[TOKEN_PERSONAS[persona].seedIndex]!;
  const wallet = await createWalletFromSeed(seed, network);
  const state = await wallet.wallet.waitForSyncedState();
  await waitForNextBlock(network.node);

  const providers = await createBrowserProviders<CircuitId>({
    network,
    wallet,
    zkConfigBaseUrl: ZK_CONFIG_BASE_URL,
    privateStateStoreName: 'tokenised-deposit-design-options',
    accountId: `public-token-${persona}`,
    privateStatePassword: PRIVATE_STATE_PASSWORD,
  });

  const nativeToken = '0'.repeat(64);
  return {
    persona,
    wallet,
    providers,
    secretKey: await tokenSecretKey(seed),
    unshieldedBalance: BigInt(state.unshielded.balances?.[nativeToken] ?? 0n),
    dustBalance: (time) => state.dust.balance(time),
  };
}

export interface TokenNaming {
  readonly name: string;
  readonly symbol: string;
}

/**
 * Deploy a fresh token with the session's persona as owner. Returns its address.
 * Name and symbol are constructor arguments — they live in the contract's public
 * state from block one, which is where every display of them reads from.
 */
export async function deployToken(session: TokenSession, naming: TokenNaming): Promise<string> {
  const owner = asAccount(accountId(session.secretKey));
  const deployed = await deployContract(session.providers, {
    compiledContract: compiledFor(session.secretKey),
    args: [naming.name, naming.symbol, 2n, owner],
  });
  return deployed.deployTxData.public.contractAddress;
}

/** Attach to an existing token as this persona (for calls, not reads). */
async function attach(session: TokenSession, address: string) {
  return findDeployedContract(session.providers, {
    contractAddress: address,
    compiledContract: compiledFor(session.secretKey),
  });
}

export async function mint(session: TokenSession, address: string, to: Account, value: bigint) {
  const token = await attach(session, address);
  const call = await token.callTx.mint(to, value);
  return { txId: call.public.txId, blockHeight: call.public.blockHeight };
}

export async function transfer(session: TokenSession, address: string, to: Account, value: bigint) {
  const token = await attach(session, address);
  const call = await token.callTx.transfer(to, value);
  return { txId: call.public.txId, blockHeight: call.public.blockHeight };
}

export async function burn(session: TokenSession, address: string, from: Account, value: bigint) {
  const token = await attach(session, address);
  const call = await token.callTx.burn(from, value);
  return { txId: call.public.txId, blockHeight: call.public.blockHeight };
}

// --- The public view --------------------------------------------------------------
//
// What Eve sees: the contract re-exports its modules' ledger state, so anyone
// can decode the FULL balances map off the indexer and enumerate it. No wallet,
// no keys, no transaction, no proof. Real indexer state, decoded client-side.

export interface PublicHolding {
  readonly account: Uint8Array;
  readonly balance: bigint;
}

export interface PublicView {
  readonly holdings: readonly PublicHolding[];
  readonly totalSupply: bigint;
  readonly owner: Uint8Array;
  /** From chain state — the name the deployer chose, visible to everyone. */
  readonly name: string;
  readonly symbol: string;
  readonly decimals: number;
}

export async function readPublicView(address: string): Promise<PublicView | null> {
  const network = getNetwork();
  const publicData = indexerPublicDataProvider(network.indexer, network.indexerWs);
  const state = await publicData.queryContractState(address);
  if (!state) return null;
  const decoded: Ledger = ledger(state.data);
  const holdings: PublicHolding[] = [];
  for (const [account, balance] of decoded._balances) {
    holdings.push({ account: account.left, balance });
  }
  return {
    holdings,
    totalSupply: decoded._totalSupply,
    owner: decoded._owner.left,
    name: decoded._name,
    symbol: decoded._symbol,
    decimals: Number(decoded._decimals),
  };
}
