/**
 * Browser chain-interaction for the two UTXO token types.
 *
 * Mirrors apps/tokenised-deposit/src/design-options/utxo-tokens.ts (the Node
 * reference — if the two disagree, that one is right).
 *
 *   'utxo'   — Unshielded UTXO token: the contract mints NATIVE coins;
 *              everything downstream is wallet-level and public.
 *   'zswap'  — ZSwap shielded token: the contract mints SHIELDED coins; the
 *              chain sees commitments, and transfers ride the shielded pool.
 *
 * "Redeem" in these models is a RETURN to the issuer's wallet — a transfer,
 * stated as such, because bearer instruments have no burn.
 */

import {
  CompactTypeBytes,
  CompactTypeVector,
  persistentHash,
  rawTokenType,
  type WitnessContext,
} from '@midnight-ntwrk/compact-runtime';
import { deployContract, submitCallTx } from '@midnight-ntwrk/midnight-js-contracts';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import type { MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import {
  Contract as NativeContract,
  ledger as nativeLedger,
} from '@mra/app-tokenised-deposit/contract-native';
import {
  Contract as ZswapContract,
  ledger as zswapLedger,
} from '@mra/app-tokenised-deposit/contract-zswap';
import { currentNetwork } from '@mra/lab-shell';
import { LOCALNET_GENESIS_SEEDS } from '@mra/network';
import { configureNetworkId, createWalletFromSeed, emitTxStage, sponsoredTransfer, type MidnightWallet } from '@mra/wallet';
import { createBrowserProviders } from '@mra/wallet/providers/browser';

import { waitForNextBlock } from './publicToken.ts';

const PRIVATE_STATE_PASSWORD = 'Localnet-Dev-Pw-2026!';

export type UtxoKind = 'utxo' | 'zswap';
export type UtxoPersona = 'acme' | 'alice' | 'bob';

const SEED_INDEX: Record<UtxoPersona, number> = { acme: 0, alice: 1, bob: 2 };

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

const hexToBytes = (hex: string) =>
  new Uint8Array((hex.match(/.{2}/g) ?? []).map((b) => parseInt(b, 16)));

/** pad(32, s) in Compact: ASCII bytes, zero-padded to 32. */
const domainSep = (s: string): Uint8Array => {
  const out = new Uint8Array(32);
  out.set(new TextEncoder().encode(s).slice(0, 32));
  return out;
};

const DOMAIN: Record<UtxoKind, string> = {
  utxo: 'mra:unshielded-utxo',
  zswap: 'mra:zswap-utxo',
};

export interface UtxoSession {
  readonly persona: UtxoPersona;
  readonly wallet: MidnightWallet;
  readonly providers: MidnightProviders<'mint'>;
  readonly ownableSk: Uint8Array;
  readonly ownerId: Uint8Array;
  readonly unshieldedBalance: bigint;
  readonly dustBalance: (time: Date) => bigint;
  readonly unshieldedAddress: string;
}

export async function connectUtxoPersona(
  kind: UtxoKind,
  persona: UtxoPersona,
  seedHex?: string,
  onProgress?: (message: string) => void,
): Promise<UtxoSession> {
  const network = currentNetwork();
  await configureNetworkId(network);
  if (network.networkId !== 'undeployed' && !seedHex) {
    throw new Error('Stagenet needs a faucet-funded seed for each persona');
  }
  const seed = seedHex ?? LOCALNET_GENESIS_SEEDS[SEED_INDEX[persona]]!;
  const wallet = await createWalletFromSeed(seed, network);
  const state = await wallet.wallet.waitForSyncedState();
  if (network.networkId !== 'undeployed') {
    const { ensureDustGeneration } = await import('@mra/wallet');
    await ensureDustGeneration(wallet, { onProgress });
  }
  await waitForNextBlock(network.node);

  const providers = await createBrowserProviders<'mint'>({
    network,
    wallet,
    zkConfigBaseUrl: `${globalThis.location.origin}/managed-${kind === 'utxo' ? 'native' : 'zswap'}`,
    privateStateStoreName: 'utxo-design-options',
    accountId: `${kind}-${persona}`,
    privateStatePassword: PRIVATE_STATE_PASSWORD,
  });

  const ownableSk = await sha256(`mra:utxo:sk:${seed}`);
  const nativeToken = '0'.repeat(64);
  const { encodeWalletAddresses } = await import('@mra/wallet');
  return {
    persona,
    wallet,
    providers,
    ownableSk,
    ownerId: persistentHash(new CompactTypeVector(1, new CompactTypeBytes(32)), [ownableSk]),
    unshieldedBalance: BigInt(state.unshielded.balances?.[nativeToken] ?? 0n),
    dustBalance: (time) => state.dust.balance(time),
    unshieldedAddress: encodeWalletAddresses(state, network).unshielded,
  };
}

function compiledFor(kind: UtxoKind, sk: Uint8Array) {
  const witnesses = {
    wit_OwnableSK: ({ privateState }: WitnessContext<unknown, undefined>) =>
      [privateState, sk] as [undefined, Uint8Array],
  };
  return kind === 'utxo'
    ? CompiledContract.make('native-token', NativeContract).pipe(
        CompiledContract.withWitnesses(witnesses as never),
        CompiledContract.withCompiledFileAssets(''),
      )
    : CompiledContract.make('zswap-token', ZswapContract).pipe(
        CompiledContract.withWitnesses(witnesses as never),
        CompiledContract.withCompiledFileAssets(''),
      );
}

export async function deployUtxoToken(
  kind: UtxoKind,
  issuer: UtxoSession,
  naming: { name: string; symbol: string },
): Promise<{ address: string; tokenType: string }> {
  const owner = { is_left: true, left: issuer.ownerId, right: { bytes: new Uint8Array(32) } };
  const deployed = await deployContract(issuer.providers as never, {
    compiledContract: compiledFor(kind, issuer.ownableSk) as never,
    args: [naming.name, naming.symbol, owner],
  } as never);
  const address = (deployed as { deployTxData: { public: { contractAddress: string } } })
    .deployTxData.public.contractAddress;
  return { address, tokenType: rawTokenType(domainSep(DOMAIN[kind]), address) };
}

/** Owner-gated contract mint, straight into the recipient's WALLET. */
export async function mintUtxo(
  kind: UtxoKind,
  issuer: UtxoSession,
  address: string,
  recipient: UtxoSession,
  value: bigint,
): Promise<{ txId: string }> {
  if (kind === 'utxo') {
    const to = { bytes: hexToBytes(String(recipient.wallet.keystore.getAddress())) };
    const result = await submitCallTx(issuer.providers as never, {
      compiledContract: compiledFor('utxo', issuer.ownableSk),
      circuitId: 'mint',
      contractAddress: address,
      args: [to, value],
    } as never);
    return { txId: (result as { public: { txId: string } }).public.txId };
  }
  const cpk = String(recipient.wallet.shieldedSecretKeys.coinPublicKey);
  const nonce = crypto.getRandomValues(new Uint8Array(32));
  const result = await submitCallTx(issuer.providers as never, {
    compiledContract: compiledFor('zswap', issuer.ownableSk),
    circuitId: 'mint',
    contractAddress: address,
    args: [{ bytes: hexToBytes(cpk) }, value, nonce],
    additionalCoinEncPublicKeyMappings: new Map([
      [cpk, String(recipient.wallet.shieldedSecretKeys.encryptionPublicKey)],
    ]),
  } as never);
  return { txId: (result as { public: { txId: string } }).public.txId };
}

/**
 * Wallet-level transfer — the UTXO model's whole point: no contract involved.
 * With a `sponsor`, the holder binds the transfer with `payFees: false` and
 * the sponsor attaches the DUST fee — the holder needs no DUST, ever.
 */
export async function walletTransferUtxo(
  kind: UtxoKind,
  from: UtxoSession,
  tokenType: string,
  to: UtxoSession,
  amount: bigint,
  sponsor?: UtxoSession,
): Promise<{ txId: string }> {
  const toState = await to.wallet.wallet.waitForSyncedState();
  const receiverAddress = kind === 'utxo' ? toState.unshielded.address : toState.shielded.address;
  const outputs = [
    kind === 'utxo'
      ? { type: 'unshielded', outputs: [{ type: tokenType, receiverAddress, amount }] }
      : { type: 'shielded', outputs: [{ type: tokenType, receiverAddress, amount }] },
  ];
  if (sponsor) {
    const txId = await sponsoredTransfer(from.wallet, sponsor.wallet, outputs as never);
    return { txId };
  }
  const recipe = await from.wallet.wallet.transferTransaction(
    outputs as never,
    { shieldedSecretKeys: from.wallet.shieldedSecretKeys, dustSecretKey: from.wallet.dustSecretKey },
    { ttl: new Date(Date.now() + 5 * 60_000) },
  );
  const signed = await from.wallet.wallet.signRecipe(recipe, from.wallet.keystore.signDataAsync);
  const finalized = await from.wallet.wallet.finalizeRecipe(signed);
  const txId = await from.wallet.wallet.submitTransaction(finalized);
  return { txId: String(txId) };
}

/** The holder's OWN wallet balance for this token type. */
export async function utxoBalanceOf(
  kind: UtxoKind,
  session: UtxoSession,
  tokenType: string,
): Promise<bigint> {
  return (await utxoBalancesOf(kind, session, tokenType)).spendable;
}

/**
 * Spendable AND pending, separately. Right after an outgoing transfer the
 * sender's change coin is pending until block inclusion — during that window
 * the spendable balance honestly reads low.
 */
export async function utxoBalancesOf(
  kind: UtxoKind,
  session: UtxoSession,
  tokenType: string,
): Promise<{ spendable: bigint; pending: bigint }> {
  const state = await session.wallet.wallet.waitForSyncedState();
  const pool = kind === 'utxo' ? state.unshielded : state.shielded;
  const spendable = BigInt(pool.balances?.[tokenType] ?? 0n);
  let pending = 0n;
  for (const coin of (pool.pendingCoins ?? []) as readonly unknown[]) {
    const c = coin as { type?: unknown; value?: unknown; utxo?: { type?: unknown; value?: unknown } };
    const type = String(c.type ?? c.utxo?.type ?? '');
    if (type === tokenType) pending += BigInt((c.value ?? c.utxo?.value ?? 0n) as bigint);
  }
  return { spendable, pending };
}

/**
 * Wait out settling change before a spend: if pending coins cover the
 * shortfall, poll until they become spendable. Returns the spendable balance —
 * still short only when the wallet genuinely cannot cover `need`.
 */
export async function awaitSpendableUtxo(
  kind: UtxoKind,
  session: UtxoSession,
  tokenType: string,
  need: bigint,
  timeoutMs = 120_000,
): Promise<bigint> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { spendable, pending } = await utxoBalancesOf(kind, session, tokenType);
    if (spendable >= need) return spendable;
    // No early exit on spendable+pending: right after a submit the wallet can
    // briefly observe NEITHER the spend nor the change note (measured on the
    // zswap kind). Poll to the deadline; a genuine shortfall errors after it.
    if (Date.now() > deadline) return spendable;
    emitTxStage(
      pending > 0n
        ? `waiting for change to settle — ${(Number(pending) / 100).toFixed(2)} pending from the previous transfer`
        : 'waiting for the wallet to observe the previous transaction',
    );
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }
}

export interface UtxoView {
  readonly name: string;
  readonly symbol: string;
  /** Total ever minted — public contract state, so issuance is attestable. */
  readonly minted: bigint;
  readonly owner: Uint8Array;
}

export async function readUtxoView(kind: UtxoKind, address: string): Promise<UtxoView | null> {
  const network = currentNetwork();
  const publicData = indexerPublicDataProvider(network.indexer, network.indexerWs);
  const state = await publicData.queryContractState(address);
  if (!state) return null;
  const decoded = (kind === 'utxo' ? nativeLedger(state.data) : zswapLedger(state.data)) as {
    _name: string;
    _symbol: string;
    _minted: bigint;
    _owner: { left: Uint8Array };
  };
  return {
    name: decoded._name,
    symbol: decoded._symbol,
    minted: decoded._minted,
    owner: decoded._owner.left,
  };
}
