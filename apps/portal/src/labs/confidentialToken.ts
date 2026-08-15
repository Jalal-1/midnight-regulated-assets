/**
 * Browser chain-interaction for the CONFIDENTIAL fungible token lab.
 *
 * Mirrors apps/tokenised-deposit/src/design-options/confidential-token.ts (the
 * Node reference — if the two disagree, that one is right): same contract,
 * same witness scheme, same deterministic identity derivation.
 *
 * The wallet-side plaintext ledger lives IN MEMORY ONLY, per page load — it is
 * exactly the private data this model exists to protect, so it is never
 * persisted anywhere (not even localStorage). A page reload therefore loses
 * the tracking; instances deployed in earlier sessions become read-only in the
 * lab (Eve's view still works — it needs no secrets) and the lifecycle is
 * re-runnable by deploying a fresh instance. The circuits verify every
 * plaintext claim (assertDecryptsTo), so wrong tracking can only fail a proof,
 * never corrupt state.
 */

import {
  CompactTypeBytes,
  CompactTypeVector,
  persistentHash,
  type JubjubPoint,
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
} from '@mra/app-tokenised-deposit/contract-confidential';
import { LOCALNET_GENESIS_SEEDS } from '@mra/network';
import { currentNetwork } from '@mra/lab-shell';
import {
  configureNetworkId,
  createWalletFromSeed,
  encodeWalletAddresses,
  ensureDustGeneration,
  type MidnightWallet,
} from '@mra/wallet';
import { createBrowserProviders } from '@mra/wallet/providers/browser';

import { waitForNextBlock } from './publicToken.ts';

/** Served by Vite from public/managed-cft — a symlink to the compiled contract. */
const ZK_CONFIG_BASE_URL = `${globalThis.location.origin}/managed-cft`;

const PRIVATE_STATE_PASSWORD = 'Localnet-Dev-Pw-2026!';

export type CftCircuitId =
  | 'register'
  | 'mint'
  | 'burnFrom'
  | 'transfer'
  | 'redeem'
  | 'sweep'
  | 'balanceOf'
  | 'pendingOf'
  | 'isRegistered'
  | 'totalSupply'
  | 'owner';

export const CFT_PERSONAS = {
  acme: { label: 'ACME Bank', seedIndex: 0 },
  alice: { label: 'Alice', seedIndex: 1 },
  bob: { label: 'Bob', seedIndex: 2 },
} as const;

export type CftPersona = keyof typeof CFT_PERSONAS;

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

const accountId = (sk: Uint8Array): Uint8Array =>
  persistentHash(new CompactTypeVector(1, new CompactTypeBytes(32)), [sk]);

export const hex = (bytes: Uint8Array): string => {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
};

const asOwner = (id: Uint8Array): Either<Uint8Array, ContractAddress> => ({
  is_left: true,
  left: id,
  right: { bytes: new Uint8Array(32) },
});

const pointsEq = (
  a: { c1: JubjubPoint; c2: JubjubPoint },
  b: { c1: JubjubPoint; c2: JubjubPoint },
) => a.c1.x === b.c1.x && a.c1.y === b.c1.y && a.c2.x === b.c2.x && a.c2.y === b.c2.y;

/**
 * One persona's wallet-side token state: identity + decryption secrets plus
 * the plaintext ledger a real wallet keeps. The chain never sees these
 * numbers; the circuits verify them against the ciphertexts.
 */
export class CftWallet {
  readonly label: string;
  readonly sk: Uint8Array;
  readonly ek: Uint8Array;
  readonly id: Uint8Array;
  spendable = 0n;
  pending = 0n;

  private constructor(label: string, sk: Uint8Array, ek: Uint8Array) {
    this.label = label;
    this.sk = sk;
    this.ek = ek;
    this.id = accountId(sk);
  }

  static async derive(label: string, seed: string): Promise<CftWallet> {
    // Byte-identical to the Node reference, so identities match across CLI/UI.
    return new CftWallet(label, await sha256(`mra:cft:sk:${seed}`), await sha256(`mra:cft:ek:${seed}`));
  }

  witnesses() {
    const self = this;
    return {
      wit_OwnableSK: ({ privateState }: WitnessContext<Ledger, undefined>) =>
        [privateState, self.sk] as [undefined, Uint8Array],
      wit_ConfidentialTokenSK: ({ privateState }: WitnessContext<Ledger, undefined>) =>
        [privateState, self.sk] as [undefined, Uint8Array],
      wit_ConfidentialTokenEK: ({ privateState }: WitnessContext<Ledger, undefined>) =>
        [privateState, self.ek] as [undefined, Uint8Array],
      // FRESH CSPRNG randomness EVERY call — seed reuse leaks amount differences.
      wit_RandomnessSeed: ({ privateState }: WitnessContext<Ledger, undefined>) =>
        [privateState, crypto.getRandomValues(new Uint8Array(32))] as [undefined, Uint8Array],
      // The circuit asserts Dec(ct) == claimed, so a wrong answer here cannot
      // corrupt state — it just fails the proof. Match the ct against the
      // ledger cells to answer for the right cell (spendable vs pending).
      wit_PlaintextBalance: (
        { privateState, ledger: l }: WitnessContext<Ledger, undefined>,
        ct: { c1: JubjubPoint; c2: JubjubPoint },
      ): [undefined, bigint] => {
        if (l._pending.member(self.id) && pointsEq(l._pending.lookup(self.id), ct)) {
          return [privateState, self.pending];
        }
        return [privateState, self.spendable];
      },
    };
  }
}

function compiledFor(wallet: CftWallet) {
  return CompiledContract.make('confidential-token', Contract).pipe(
    CompiledContract.withWitnesses(wallet.witnesses()),
    CompiledContract.withCompiledFileAssets(''),
  );
}

export interface CftSession {
  readonly persona: CftPersona;
  readonly wallet: MidnightWallet;
  readonly providers: MidnightProviders<CftCircuitId>;
  readonly tokenWallet: CftWallet;
  /** NIGHT, in stars. */
  readonly unshieldedBalance: bigint;
  readonly dustBalance: (time: Date) => bigint;
  /** bech32m unshielded address — what a faucet funds. */
  readonly unshieldedAddress: string;
}

/** Build a persona's wallet, providers, and token-wallet secrets. */
export async function connectCftPersona(
  persona: CftPersona,
  seedHex?: string,
  onProgress?: (message: string) => void,
): Promise<CftSession> {
  const network = currentNetwork();
  await configureNetworkId(network);

  if (network.networkId !== 'undeployed' && !seedHex) {
    throw new Error('Stagenet needs a faucet-funded seed for each persona');
  }
  const seed = seedHex ?? LOCALNET_GENESIS_SEEDS[CFT_PERSONAS[persona].seedIndex]!;
  const tokenWallet = await CftWallet.derive(CFT_PERSONAS[persona].label, seed);

  const wallet = await createWalletFromSeed(seed, network);
  const state = await wallet.wallet.waitForSyncedState();
  if (network.networkId !== 'undeployed') {
    await ensureDustGeneration(wallet, { onProgress });
  }
  await waitForNextBlock(network.node);

  const providers = await createBrowserProviders<CftCircuitId>({
    network,
    wallet,
    zkConfigBaseUrl: ZK_CONFIG_BASE_URL,
    privateStateStoreName: 'tokenised-deposit-design-options',
    accountId: `cft-${persona}`,
    privateStatePassword: PRIVATE_STATE_PASSWORD,
  });

  const nativeToken = '0'.repeat(64);
  return {
    persona,
    wallet,
    providers,
    tokenWallet,
    unshieldedBalance: BigInt(state.unshielded.balances?.[nativeToken] ?? 0n),
    dustBalance: (time) => state.dust.balance(time),
    unshieldedAddress: encodeWalletAddresses(state, network).unshielded,
  };
}

export interface CftNaming {
  readonly name: string;
  readonly symbol: string;
}

export async function deployCft(session: CftSession, naming: CftNaming): Promise<string> {
  const deployed = await deployContract(session.providers, {
    compiledContract: compiledFor(session.tokenWallet),
    args: [naming.name, naming.symbol, 2n, asOwner(session.tokenWallet.id)],
  });
  return deployed.deployTxData.public.contractAddress;
}

async function attach(session: CftSession, address: string) {
  return findDeployedContract(session.providers, {
    contractAddress: address,
    compiledContract: compiledFor(session.tokenWallet),
  });
}

type Tx = { txId: string; blockHeight: number };
const asTx = (call: { public: { txId: string; blockHeight: number } }): Tx => ({
  txId: call.public.txId,
  blockHeight: call.public.blockHeight,
});

export async function registerCft(session: CftSession, address: string): Promise<Tx> {
  const token = await attach(session, address);
  return asTx(await token.callTx.register());
}

export async function mintCft(
  issuer: CftSession,
  address: string,
  to: CftWallet,
  value: bigint,
): Promise<Tx> {
  const token = await attach(issuer, address);
  const call = await token.callTx.mint(to.id, value);
  to.pending += value;
  return asTx(call);
}

export async function sweepCft(session: CftSession, address: string): Promise<Tx> {
  const token = await attach(session, address);
  const call = await token.callTx.sweep();
  session.tokenWallet.spendable += session.tokenWallet.pending;
  session.tokenWallet.pending = 0n;
  return asTx(call);
}

export async function transferCft(
  sender: CftSession,
  address: string,
  to: CftWallet,
  value: bigint,
): Promise<Tx> {
  const token = await attach(sender, address);
  const call = await token.callTx.transfer(to.id, value);
  sender.tokenWallet.spendable -= value;
  to.pending += value;
  return asTx(call);
}

export async function redeemCft(session: CftSession, address: string, value: bigint): Promise<Tx> {
  const token = await attach(session, address);
  const call = await token.callTx.redeem(value);
  session.tokenWallet.spendable -= value;
  return asTx(call);
}

// --- Eve's view -----------------------------------------------------------------
//
// Decoded from real indexer state, no wallet and no keys: the token identity,
// the PUBLIC total supply, the registration list, and the balance cells — which
// are ElGamal ciphertexts, not numbers.

export interface CftCiphertextCell {
  readonly account: Uint8Array;
  readonly c1x: string;
}

export interface CftView {
  readonly name: string;
  readonly symbol: string;
  readonly decimals: number;
  readonly totalSupply: bigint;
  readonly registered: readonly Uint8Array[];
  readonly balances: readonly CftCiphertextCell[];
  readonly pending: readonly CftCiphertextCell[];
  readonly owner: Uint8Array;
}

export async function readCftView(address: string): Promise<CftView | null> {
  const network = currentNetwork();
  const publicData = indexerPublicDataProvider(network.indexer, network.indexerWs);
  const state = await publicData.queryContractState(address);
  if (!state) return null;
  const decoded: Ledger = ledger(state.data);
  const registered: Uint8Array[] = [];
  for (const [id] of decoded._encryptionKeys) registered.push(id);
  const cells = (map: Ledger['_balances']): CftCiphertextCell[] => {
    const out: CftCiphertextCell[] = [];
    for (const [account, ct] of map) out.push({ account, c1x: ct.c1.x.toString(16) });
    return out;
  };
  return {
    name: decoded._name,
    symbol: decoded._symbol,
    decimals: Number(decoded._decimals),
    totalSupply: decoded._totalSupply,
    registered,
    balances: cells(decoded._balances),
    pending: cells(decoded._pending),
    owner: decoded._owner.left,
  };
}
