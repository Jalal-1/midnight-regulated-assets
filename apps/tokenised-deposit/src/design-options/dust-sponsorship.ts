/**
 * DUST sponsorship — proof of the two-stage flow, end to end.
 *
 * Alice is a FRESH wallet: zero NIGHT, zero DUST, and it stays that way for
 * the whole script. ACME Bank sponsors her. Three sponsored transactions:
 *
 *   1. Alice DEPLOYS her own mint contract     (contract path, via providers)
 *   2. Alice MINTS 500.00 tokens to herself    (contract call, owner = Alice)
 *   3. Alice TRANSFERS 200.00 to Bob           (wallet path, payFees: false)
 *
 * Each one: Alice proves and binds first; ACME can only attach the DUST fee
 * and submit. At the end we assert the actions happened AND Alice's DUST is
 * still exactly zero — gasless, and provably her own actions (the contract
 * authority is her secret's public id, which ACME never had).
 *
 * Run:  yarn workspace @mra/app-tokenised-deposit design-options:sponsorship
 * Needs: a running localnet (same stack Stagenet runs).
 */

import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  CompactTypeBytes,
  CompactTypeVector,
  persistentHash,
  rawTokenType,
  type WitnessContext,
} from '@midnight-ntwrk/compact-runtime';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { getNetwork, LOCALNET_GENESIS_SEEDS } from '@mra/network';
import {
  configureNetworkId,
  createWalletFromSeed,
  onTxStage,
  sponsoredAdapters,
  sponsoredTransfer,
  type MidnightWallet,
} from '@mra/wallet';
import { createProviders } from '@mra/wallet/providers';

import { Contract as NativeContract } from '../../contract/managed/native-token/contract/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MANAGED = resolve(HERE, '../../contract/managed/native-token');
const PRIVATE_STATE_PASSWORD = process.env.MRA_PRIVATE_STATE_PASSWORD ?? 'Localnet-Dev-Pw-2026!';

const network = getNetwork();
if ((process.env.MRA_NETWORK ?? 'localnet') !== 'localnet') {
  throw new Error('localnet-only reference: uses well-known genesis seeds.');
}

const sha256 = (text: string) => new Uint8Array(createHash('sha256').update(text).digest());
const hexToBytes = (hex: string) =>
  new Uint8Array((hex.match(/.{2}/g) ?? []).map((b) => parseInt(b, 16)));
const fmt = (units: bigint) => `${(Number(units) / 100).toFixed(2)}`;
const fmtDust = (specks: bigint) => `${(Number(specks) / 1e15).toFixed(4)}`;
const log = (message: string) => console.log(message);

const domainSep = (s: string): Uint8Array => {
  const out = new Uint8Array(32);
  out.set(new TextEncoder().encode(s).slice(0, 32));
  return out;
};

async function dustOf(mw: MidnightWallet): Promise<bigint> {
  const state = await mw.wallet.waitForSyncedState();
  return state.dust.balance(new Date());
}

async function tokenBalanceOf(mw: MidnightWallet, tokenType: string): Promise<bigint> {
  const state = await mw.wallet.waitForSyncedState();
  return BigInt(state.unshielded.balances?.[tokenType] ?? 0n);
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
  const offStages = onTxStage((m) => log(`    · ${m}`));

  log('building wallets…');
  // ACME: genesis-funded — the SPONSOR. Bob: a recipient. Alice: brand new.
  const acme = await createWalletFromSeed(LOCALNET_GENESIS_SEEDS[0]!, network);
  const bob = await createWalletFromSeed(LOCALNET_GENESIS_SEEDS[2]!, network);
  const aliceSeed = randomBytes(32).toString('hex');
  const alice = await createWalletFromSeed(aliceSeed, network);

  try {
    const aliceState = await alice.wallet.waitForSyncedState();
    const bobState = await bob.wallet.waitForSyncedState();
    await acme.wallet.waitForSyncedState();

    const aliceDustBefore = await dustOf(alice);
    const aliceNight = BigInt(aliceState.unshielded.balances?.['0'.repeat(64)] ?? 0n);
    log(`Alice starts with: ${aliceNight} NIGHT · ${fmtDust(aliceDustBefore)} DUST`);
    if (aliceNight !== 0n || aliceDustBefore !== 0n) throw new Error('Alice must start unfunded');
    const acmeDustBefore = await dustOf(acme);
    log(`ACME (sponsor) DUST: ${fmtDust(acmeDustBefore)}`);

    // Providers for ALICE — with the two sponsored adapters swapped in. Alice
    // proves (she is the prover; her witness secret never leaves this provider
    // set), balances only her own tokens, and binds. "Submit" is ACME's side.
    const sponsored = sponsoredAdapters(alice, acme);
    const base = await createProviders<'mint'>({
      network,
      wallet: alice,
      zkConfigPath: MANAGED,
      privateStateStoreName: 'dust-sponsorship',
      accountId: 'sponsored-alice',
      privateStatePassword: PRIVATE_STATE_PASSWORD,
    });
    const providers = {
      ...base,
      walletProvider: { ...base.walletProvider, balanceTx: sponsored.balanceTx },
      midnightProvider: { submitTx: sponsored.submitTx },
    };

    // Alice's contract authority: her secret, hashed. ACME never sees the secret.
    const aliceSk = sha256(`mra:utxo:sk:${aliceSeed}`);
    const ownerId = persistentHash(new CompactTypeVector(1, new CompactTypeBytes(32)), [aliceSk]);
    const owner = { is_left: true, left: ownerId, right: { bytes: new Uint8Array(32) } };
    const witnesses = {
      wit_OwnableSK: ({ privateState }: WitnessContext<unknown, undefined>) =>
        [privateState, aliceSk] as [undefined, Uint8Array],
    };
    const compiled = CompiledContract.make('native-token', NativeContract).pipe(
      CompiledContract.withWitnesses(witnesses),
      CompiledContract.withCompiledFileAssets(MANAGED),
    );

    log('\n[1] SPONSORED DEPLOY — Alice (0 DUST) deploys her own mint contract…');
    const deployed = await deployContract(providers, {
      compiledContract: compiled,
      args: ['Sponsored token', 'SPT', owner],
    });
    const address = deployed.deployTxData.public.contractAddress;
    const tokenType = rawTokenType(domainSep('mra:unshielded-utxo'), address);
    log(`  deployed at ${address.slice(0, 16)}… — Alice paid nothing`);

    log('\n[2] SPONSORED CALL — Alice mints 500.00 SPT to herself…');
    await deployed.callTx.mint(
      { bytes: hexToBytes(String(alice.keystore.getAddress())) },
      50_000n,
    );
    await waitFor(() => tokenBalanceOf(alice, tokenType), 50_000n, 'alice SPT after mint');
    log(`  Alice holds ${fmt(50_000n)} SPT — still zero DUST spent by her`);

    log('\n[3] SPONSORED WALLET TRANSFER — Alice sends 200.00 SPT to Bob (payFees: false)…');
    await sponsoredTransfer(alice, acme, [
      {
        type: 'unshielded',
        outputs: [{ type: tokenType, receiverAddress: bobState.unshielded.address, amount: 20_000n }],
      },
    ] as never);
    await waitFor(() => tokenBalanceOf(bob, tokenType), 20_000n, 'bob SPT after transfer');
    log('  landed.');

    const aliceDustAfter = await dustOf(alice);
    const acmeDustAfter = await dustOf(acme);
    log('\n=== VERDICT ===');
    log(`Alice: deployed a contract, minted, transferred — 3 on-chain actions`);
    log(`Alice DUST before: ${fmtDust(aliceDustBefore)} · after: ${fmtDust(aliceDustAfter)} (expected 0.0000)`);
    log(`ACME  DUST before: ${fmtDust(acmeDustBefore)} · after: ${fmtDust(acmeDustAfter)} — the sponsor paid`);
    log(`Alice final SPT: ${fmt(await tokenBalanceOf(alice, tokenType))} · Bob: ${fmt(20_000n)}`);
    if (aliceDustAfter !== 0n) throw new Error('Alice somehow spent/holds DUST — sponsorship leak');
    log('\nOK — gasless for Alice, fee-only for ACME, authority provably Alice’s.');
  } finally {
    offStages();
    await Promise.allSettled([acme.wallet.stop(), alice.wallet.stop(), bob.wallet.stop()]);
  }
}

let failed = false;
try {
  await main();
} catch (error) {
  console.error('FAILED:', error);
  failed = true;
}
process.exit(failed ? 1 : 0);
