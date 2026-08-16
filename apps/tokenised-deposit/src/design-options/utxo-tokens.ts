/**
 * UTXO tokens — the two native-asset design options, end to end.
 *
 *   Unshielded UTXO token  contract mints NATIVE unshielded coins; they move
 *                          wallet-to-wallet under signatures, outside any
 *                          contract's reach.
 *   ZSwap shielded token   contract mints SHIELDED coins; the world sees a
 *                          commitment, and later movement is hidden by the
 *                          shielded pool.
 *
 * Both mints are owner-gated with a public "total ever minted" cell, so
 * issuance is attestable even though the coins live outside the contract.
 * This script is the reference the studio mirrors: deploy → issue 1,000.00 →
 * wallet transfer 250.00 → return 500.00 to the issuer, for each token, with
 * balances read from the wallets (unshielded: public data; shielded: the
 * holder's own view).
 *
 * Run:  yarn workspace @mra/app-tokenised-deposit design-options:utxo
 * Needs: a running localnet (same stack Stagenet runs).
 */

import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { rawTokenType } from '@midnight-ntwrk/compact-runtime';
import { deployContract, submitCallTx } from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import { getNetwork, LOCALNET_GENESIS_SEEDS } from '@mra/network';
import { configureNetworkId, createWalletFromSeed, type MidnightWallet } from '@mra/wallet';
import { createProviders } from '@mra/wallet/providers';

import { Contract as NativeContract } from '../../contract/managed/native-token/contract/index.js';
import { Contract as ZswapContract } from '../../contract/managed/zswap-token/contract/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MANAGED = (name: string) => resolve(HERE, `../../contract/managed/${name}`);
const PRIVATE_STATE_PASSWORD = process.env.MRA_PRIVATE_STATE_PASSWORD ?? 'Localnet-Dev-Pw-2026!';

const network = getNetwork();
if ((process.env.MRA_NETWORK ?? 'localnet') !== 'localnet') {
  throw new Error('localnet-only reference: uses well-known genesis seeds.');
}

const NATIVE_TOKEN = '0'.repeat(64);
const sha256 = (text: string) => new Uint8Array(createHash('sha256').update(text).digest());
const hexToBytes = (hex: string) =>
  new Uint8Array((hex.match(/.{2}/g) ?? []).map((b) => parseInt(b, 16)));
const fmt = (units: bigint) => `${(Number(units) / 100).toFixed(2)}`;
const log = (message: string) => console.log(message);

/** pad(32, s) in Compact: ASCII bytes, zero-padded to 32. */
const domainSep = (s: string): Uint8Array => {
  const out = new Uint8Array(32);
  out.set(new TextEncoder().encode(s).slice(0, 32));
  return out;
};

interface Session {
  readonly label: string;
  readonly mw: MidnightWallet;
  readonly ownableSk: Uint8Array;
}

async function session(label: string, seedIndex: number): Promise<Session> {
  const seed = LOCALNET_GENESIS_SEEDS[seedIndex]!;
  const mw = await createWalletFromSeed(seed, network);
  await mw.wallet.waitForSyncedState();
  return { label, mw, ownableSk: sha256(`mra:utxo:sk:${seed}`) };
}

function ownableWitness(sk: Uint8Array) {
  return {
    wit_OwnableSK: ({ privateState }: WitnessContext<unknown, undefined>) =>
      [privateState, sk] as [undefined, Uint8Array],
  };
}

/** Wallet-level transfer of an arbitrary token type (the UTXO model's whole point). */
async function walletTransfer(
  from: Session,
  kind: 'unshielded' | 'shielded',
  tokenType: string,
  receiverAddress: unknown,
  amount: bigint,
): Promise<string> {
  const recipe = await from.mw.wallet.transferTransaction(
    [
      kind === 'unshielded'
        ? { type: 'unshielded', outputs: [{ type: tokenType, receiverAddress, amount }] }
        : { type: 'shielded', outputs: [{ type: tokenType, receiverAddress, amount }] },
    ] as never,
    { shieldedSecretKeys: from.mw.shieldedSecretKeys, dustSecretKey: from.mw.dustSecretKey },
    { ttl: new Date(Date.now() + 5 * 60_000) },
  );
  const signed = await from.mw.wallet.signRecipe(recipe, from.mw.keystore.signDataAsync);
  const finalized = await from.mw.wallet.finalizeRecipe(signed);
  const txId = await from.mw.wallet.submitTransaction(finalized);
  return String(txId);
}

async function unshieldedBalanceOf(s: Session, tokenType: string): Promise<bigint> {
  const state = await s.mw.wallet.waitForSyncedState();
  return BigInt(state.unshielded.balances?.[tokenType] ?? 0n);
}

async function shieldedBalanceOf(s: Session, tokenType: string): Promise<bigint> {
  const state = await s.mw.wallet.waitForSyncedState();
  return BigInt(state.shielded.balances?.[tokenType] ?? 0n);
}

async function waitFor(fn: () => Promise<bigint>, expect: bigint, what: string): Promise<void> {
  for (let i = 0; i < 60; i += 1) {
    if ((await fn()) === expect) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`${what}: expected ${expect}, got ${await fn()}`);
}

async function main(): Promise<void> {
  await configureNetworkId(network);
  log(`network ${network.networkId}`);

  log('building wallets (ACME Bank, Alice, Bob)…');
  const acme = await session('ACME Bank', 0);
  const alice = await session('Alice', 1);
  const bob = await session('Bob', 2);

  try {
    const { persistentHash, CompactTypeVector, CompactTypeBytes } = await import(
      '@midnight-ntwrk/compact-runtime'
    );
    const ownerId = persistentHash(new CompactTypeVector(1, new CompactTypeBytes(32)), [
      acme.ownableSk,
    ]);
    const owner = { is_left: true, left: ownerId, right: { bytes: new Uint8Array(32) } };

    const aliceState = await alice.mw.wallet.waitForSyncedState();
    const bobState = await bob.mw.wallet.waitForSyncedState();
    const acmeState = await acme.mw.wallet.waitForSyncedState();

    // ============ 1) UNSHIELDED UTXO TOKEN =========================================
    log('\n=== Unshielded UTXO token ===');
    {
      const providers = await createProviders<'mint'>({
        network,
        wallet: acme.mw,
        zkConfigPath: MANAGED('native-token'),
        privateStateStoreName: 'utxo-design-options',
        accountId: 'native-acme',
        privateStatePassword: PRIVATE_STATE_PASSWORD,
      });
      const compiled = CompiledContract.make('native-token', NativeContract).pipe(
        CompiledContract.withWitnesses(ownableWitness(acme.ownableSk)),
        CompiledContract.withCompiledFileAssets(MANAGED('native-token')),
      );
      log('deploying mint contract…');
      const deployed = await deployContract(providers, {
        compiledContract: compiled,
        args: ['Unshielded UTXO token', 'UUT', owner],
      });
      const address = deployed.deployTxData.public.contractAddress;
      const tokenType = rawTokenType(domainSep('mra:unshielded-utxo'), address);
      log(`  address ${address.slice(0, 16)}… · token type ${tokenType.slice(0, 16)}…`);

      log('issue: mint 1,000.00 UUT to Alice (native coins, straight to her wallet)…');
      await deployed.callTx.mint({ bytes: hexToBytes(String(alice.mw.keystore.getAddress())) }, 100_000n);
      await waitFor(() => unshieldedBalanceOf(alice, tokenType), 100_000n, 'alice UUT after mint');
      log(`  Alice wallet balance: ${fmt(100_000n)} UUT (public unshielded state)`);

      log('transfer: Alice → Bob 250.00 UUT — a plain WALLET transfer, no contract involved…');
      await walletTransfer(alice, 'unshielded', tokenType, bobState.unshielded.address, 25_000n);
      await waitFor(() => unshieldedBalanceOf(bob, tokenType), 25_000n, 'bob UUT after transfer');
      log('  landed. No circuit ran: the coins moved under Alice’s signature alone.');

      log('return: Alice → issuer 500.00 UUT (a transfer — the model has no burn)…');
      await walletTransfer(alice, 'unshielded', tokenType, acmeState.unshielded.address, 50_000n);
      await waitFor(() => unshieldedBalanceOf(acme, tokenType), 50_000n, 'issuer UUT after return');
      const aliceLeft = await unshieldedBalanceOf(alice, tokenType);
      log(`  final: Alice ${fmt(aliceLeft)} · Bob ${fmt(25_000n)} · issuer ${fmt(50_000n)} — all PUBLIC`);
      if (aliceLeft !== 25_000n) throw new Error(`alice residual: ${aliceLeft}`);
    }

    // ============ 2) ZSWAP SHIELDED UTXO TOKEN =====================================
    log('\n=== ZSwap shielded UTXO token ===');
    {
      const providers = await createProviders<'mint'>({
        network,
        wallet: acme.mw,
        zkConfigPath: MANAGED('zswap-token'),
        privateStateStoreName: 'utxo-design-options',
        accountId: 'zswap-acme',
        privateStatePassword: PRIVATE_STATE_PASSWORD,
      });
      const compiled = CompiledContract.make('zswap-token', ZswapContract).pipe(
        CompiledContract.withWitnesses(ownableWitness(acme.ownableSk)),
        CompiledContract.withCompiledFileAssets(MANAGED('zswap-token')),
      );
      log('deploying mint contract…');
      const deployed = await deployContract(providers, {
        compiledContract: compiled,
        args: ['ZSwap shielded token', 'ZST', owner],
      });
      const address = deployed.deployTxData.public.contractAddress;
      const tokenType = rawTokenType(domainSep('mra:zswap-utxo'), address);
      log(`  address ${address.slice(0, 16)}… · token type ${tokenType.slice(0, 16)}…`);

      log('issue: mint 1,000.00 ZST to Alice — the chain sees a COMMITMENT, not her…');
      // Minting a shielded coin TO someone needs their ENCRYPTION public key so
      // the coin ciphertext can be produced for them — supplied as an explicit
      // mapping, coin public key → encryption public key.
      await submitCallTx(providers as never, {
        compiledContract: compiled,
        circuitId: 'mint',
        contractAddress: address,
        args: [
          { bytes: hexToBytes(String(alice.mw.shieldedSecretKeys.coinPublicKey)) },
          100_000n,
          randomBytes(32),
        ],
        additionalCoinEncPublicKeyMappings: new Map([
          [String(alice.mw.shieldedSecretKeys.coinPublicKey), String(alice.mw.shieldedSecretKeys.encryptionPublicKey)],
        ]),
      } as never);
      await waitFor(() => shieldedBalanceOf(alice, tokenType), 100_000n, 'alice ZST after mint');
      log(`  Alice's own view: ${fmt(100_000n)} ZST (nobody else can see this number)`);

      log('transfer: Alice → Bob 250.00 ZST through the shielded pool…');
      await walletTransfer(alice, 'shielded', tokenType, bobState.shielded.address, 25_000n);
      await waitFor(() => shieldedBalanceOf(bob, tokenType), 25_000n, 'bob ZST after transfer');
      log('  landed. Amount, sender and recipient are hidden by the ledger.');

      log('return: Alice → issuer 500.00 ZST…');
      await walletTransfer(alice, 'shielded', tokenType, acmeState.shielded.address, 50_000n);
      await waitFor(() => shieldedBalanceOf(acme, tokenType), 50_000n, 'issuer ZST after return');
      const aliceLeft = await shieldedBalanceOf(alice, tokenType);
      log(`  final (each party's own view): Alice ${fmt(aliceLeft)} · Bob ${fmt(25_000n)} · issuer ${fmt(50_000n)}`);
      if (aliceLeft !== 25_000n) throw new Error(`alice residual: ${aliceLeft}`);
    }

    log('\nOK — both UTXO tokens: owner-gated mint, wallet-level lifecycle, attestable issuance.');
  } finally {
    await Promise.allSettled([acme.mw.wallet.stop(), alice.mw.wallet.stop(), bob.mw.wallet.stop()]);
  }
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error('\nfailed:', error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
