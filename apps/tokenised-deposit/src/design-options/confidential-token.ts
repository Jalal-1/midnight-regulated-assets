/**
 * Design option 2 — the account-based CONFIDENTIAL fungible token, live.
 *
 * Runs the deposit lifecycle on the OZ ConfidentialFungibleToken (+ PublicSupply
 * + Ownable) composition:
 *
 *   deploy (ACME Bank owns) → Alice & Bob register encryption keys →
 *   issue 1,000.00 to Alice → Alice sweeps → Alice pays Bob 250.00 →
 *   Bob sweeps → Alice redeems 500.00 → Eve reads
 *
 * and then shows what Eve CANNOT see: the balances map holds ElGamal
 * ciphertexts (curve points), not amounts. What she CAN see, by design: the
 * total supply (the PublicSupply extension exists so an issuer can attest
 * circulating supply), the counterparty graph, and the registration list.
 *
 * WITNESSES — the part that makes or breaks confidentiality:
 *  - wit_ConfidentialTokenSK / wit_OwnableSK: the persona's secret; the circuit
 *    binds accountId = H(SK), so a wrong secret just fails the proof.
 *  - wit_ConfidentialTokenEK: the persona's ElGamal decryption secret; the
 *    circuit re-derives the public key and checks it against the registry.
 *  - wit_RandomnessSeed: FRESH CSPRNG bytes on every call. OZ's own test
 *    witness returns a fixed seed and says in its header that a real wallet
 *    must not — seed reuse leaks amount differences. This driver does it
 *    properly: crypto.randomBytes(32) per invocation.
 *  - wit_PlaintextBalance(ct): the caller's own balance in plaintext. A wallet
 *    knows this by tracking its history (or ElGamal-decrypting by discrete
 *    log). This driver tracks it — and the circuit VERIFIES the claim against
 *    the on-chain ciphertext, so wrong tracking fails the proof rather than
 *    corrupting state. The ct argument is matched against the ledger's balance
 *    vs pending cell to return the right number.
 *
 * Run:  node --experimental-strip-types apps/tokenised-deposit/src/design-options/confidential-token.ts
 * Needs: localnet up + `yarn redeploy`. Stagenet: set MRA_NETWORK=stagenet and
 *        MRA_CFT_SEED_ACME / _ALICE / _BOB to faucet-funded seeds.
 */

import { randomBytes } from 'node:crypto';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  CompactTypeBytes,
  CompactTypeVector,
  persistentHash,
  type JubjubPoint,
  type WitnessContext,
} from '@midnight-ntwrk/compact-runtime';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import {
  breakdownWindow,
  describeBreakdown,
  getNetwork,
  LOCALNET_GENESIS_SEEDS,
  meterProving,
} from '@mra/network';
import { configureNetworkId, createWalletFromSeed } from '@mra/wallet';
import { createProviders } from '@mra/wallet/providers';

import {
  Contract,
  ledger,
  type Either,
  type ContractAddress,
  type Ledger,
} from '../../contract/managed/confidential-token/contract/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ZK_CONFIG_PATH = resolve(HERE, '../../contract/managed/confidential-token');
const PRIVATE_STATE_PASSWORD = process.env.MRA_PRIVATE_STATE_PASSWORD ?? 'Localnet-Dev-Pw-2026!';

type CircuitId =
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

const sha256 = (text: string): Uint8Array => new Uint8Array(createHash('sha256').update(text).digest());
const accountId = (sk: Uint8Array): Uint8Array =>
  persistentHash(new CompactTypeVector(1, new CompactTypeBytes(32)), [sk]);
const hex = (b: Uint8Array): string => Buffer.from(b).toString('hex');
const asOwner = (id: Uint8Array): Either<Uint8Array, ContractAddress> => ({
  is_left: true,
  left: id,
  right: { bytes: new Uint8Array(32) },
});

const pointsEq = (a: { c1: JubjubPoint; c2: JubjubPoint }, b: { c1: JubjubPoint; c2: JubjubPoint }) =>
  a.c1.x === b.c1.x && a.c1.y === b.c1.y && a.c2.x === b.c2.x && a.c2.y === b.c2.y;

/**
 * One persona's wallet-side token state: secrets plus the plaintext ledger a
 * real wallet would keep. The chain never sees these numbers; the circuits
 * verify them against the ciphertexts.
 */
class TokenWallet {
  readonly label: string;
  readonly sk: Uint8Array;
  readonly ek: Uint8Array;
  readonly id: Uint8Array;
  spendable = 0n;
  pending = 0n;

  // No parameter properties: strip-only TS (node --experimental-strip-types)
  // does not support them.
  constructor(label: string, seed: string) {
    this.label = label;
    this.sk = sha256(`mra:cft:sk:${seed}`);
    this.ek = sha256(`mra:cft:ek:${seed}`);
    this.id = accountId(this.sk);
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
      // FRESH randomness EVERY call — seed reuse leaks amount differences.
      wit_RandomnessSeed: ({ privateState }: WitnessContext<Ledger, undefined>) =>
        [privateState, new Uint8Array(randomBytes(32))] as [undefined, Uint8Array],
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

function compiledFor(wallet: TokenWallet) {
  return CompiledContract.make('confidential-token', Contract).pipe(
    CompiledContract.withWitnesses(wallet.witnesses()),
    CompiledContract.withCompiledFileAssets(ZK_CONFIG_PATH),
  );
}

const fmt = (units: bigint) => `${(Number(units) / 100).toFixed(2)}`;
const elapsed = (since: number) => `${((Date.now() - since) / 1000).toFixed(1)}s`;

async function main(): Promise<void> {
  const network = getNetwork();
  await configureNetworkId(network);
  const meter = meterProving(network.proofServer);

  const seeds =
    network.networkId === 'undeployed'
      ? {
          acme: LOCALNET_GENESIS_SEEDS[0],
          alice: LOCALNET_GENESIS_SEEDS[1],
          bob: LOCALNET_GENESIS_SEEDS[2],
        }
      : {
          acme: process.env.MRA_CFT_SEED_ACME ?? '',
          alice: process.env.MRA_CFT_SEED_ALICE ?? '',
          bob: process.env.MRA_CFT_SEED_BOB ?? '',
        };
  for (const [who, seed] of Object.entries(seeds)) {
    if (!/^[0-9a-f]{64}$/i.test(seed)) {
      throw new Error(`missing/invalid seed for ${who} — on Stagenet set MRA_CFT_SEED_${who.toUpperCase()} to a faucet-funded seed`);
    }
  }

  console.log(`network ${network.networkId} · prover ${network.proofServer}`);
  console.log('building wallets (ACME Bank = issuer, Alice + Bob = customers)…');

  const cast = {
    acme: new TokenWallet('ACME Bank', seeds.acme),
    alice: new TokenWallet('Alice', seeds.alice),
    bob: new TokenWallet('Bob', seeds.bob),
  };

  const sessions = {} as Record<'acme' | 'alice' | 'bob', Awaited<ReturnType<typeof buildSession>>>;
  async function buildSession(who: keyof typeof cast) {
    const midnightWallet = await createWalletFromSeed(seeds[who], network);
    await midnightWallet.wallet.waitForSyncedState();
    const providers = await createProviders<CircuitId>({
      network,
      wallet: midnightWallet,
      zkConfigPath: ZK_CONFIG_PATH,
      privateStateStoreName: 'tokenised-deposit-design-options',
      accountId: `cft-${who}`,
      privateStatePassword: PRIVATE_STATE_PASSWORD,
    });
    return { wallet: midnightWallet, providers, tokenWallet: cast[who] };
  }
  for (const who of ['acme', 'alice', 'bob'] as const) {
    const t = Date.now();
    sessions[who] = await buildSession(who);
    console.log(`  ${who} wallet synced in ${elapsed(t)}`);
  }

  // A freshly started wallet may submit its own DUST registration; wait a block
  // so deploys/mints don't double-spend the DUST coin it used (field notes).
  await new Promise((r) => setTimeout(r, 7000));

  const run = async (label: string, fn: () => Promise<unknown>) => {
    const t = Date.now();
    const before = meter.calls().length;
    const result = await fn();
    const b = breakdownWindow(meter, before, t, Date.now());
    console.log(`  ${label} in ${elapsed(t)}${b ? ` — ${describeBreakdown(b)}` : ''}`);
    return result;
  };

  try {
    console.log('\ndeploying confidential token (ACME Bank is owner)…');
    let address = '';
    await run('deployed', async () => {
      const deployed = await deployContract(sessions.acme.providers, {
        compiledContract: compiledFor(cast.acme),
        args: ['ACME Confidential Deposit', 'cmUSD', 2n, asOwner(cast.acme.id)],
      });
      address = deployed.deployTxData.public.contractAddress;
    });
    console.log(`  address ${address}`);

    const attach = (who: keyof typeof cast) =>
      findDeployedContract(sessions[who].providers, {
        contractAddress: address,
        compiledContract: compiledFor(cast[who]),
      });

    console.log('\nAlice and Bob register their encryption keys…');
    const aliceToken = await attach('alice');
    const bobToken = await attach('bob');
    await run('Alice registered', () => aliceToken.callTx.register());
    await run('Bob registered', () => bobToken.callTx.register());

    console.log('\nissue: ACME Bank mints 1,000.00 cmUSD to Alice (amount public ONLY via supply delta)…');
    const acmeToken = await attach('acme');
    await run('minted', () => acmeToken.callTx.mint(cast.alice.id, 100_000n));
    cast.alice.pending += 100_000n;

    console.log('\nAlice sweeps her incoming funds into her spendable balance…');
    await run('swept', () => aliceToken.callTx.sweep());
    cast.alice.spendable += cast.alice.pending;
    cast.alice.pending = 0n;

    console.log('\ntransfer: Alice pays Bob 250.00 — the AMOUNT IS HIDDEN; the (sender, recipient) pair is public…');
    await run('transferred', () => aliceToken.callTx.transfer(cast.bob.id, 25_000n));
    cast.alice.spendable -= 25_000n;
    cast.bob.pending += 25_000n;

    await run('Bob swept', () => bobToken.callTx.sweep());
    cast.bob.spendable += cast.bob.pending;
    cast.bob.pending = 0n;

    console.log('\nredeem: Alice surrenders 500.00 (burn; the amount shows in the supply delta)…');
    await run('redeemed', () => aliceToken.callTx.redeem(50_000n));
    cast.alice.spendable -= 50_000n;

    // ---- Eve: no wallet, no keys — what does the chain actually serve? -------
    console.log('\nEve (public observer) reads the contract state off the indexer:');
    const state = await sessions.acme.providers.publicDataProvider.queryContractState(address);
    if (!state) throw new Error('no contract state');
    const decoded = ledger(state.data);
    console.log(`  token          ${decoded._name} (${decoded._symbol})`);
    console.log(`  totalSupply    ${fmt(decoded._totalSupply)} — PUBLIC by design (issuer attests circulating supply)`);
    console.log(`  registered     ${decoded._encryptionKeys.size()} accounts (ids + encryption keys are public)`);
    for (const [id, ct] of decoded._balances) {
      const who = [cast.acme, cast.alice, cast.bob].find((w) => hex(w.id) === hex(id));
      console.log(
        `  balance[${(who?.label ?? hex(id).slice(0, 8)).padEnd(8)}] = ElGamal ciphertext (c1.x=${ct.c1.x.toString(16).slice(0, 12)}…) — NOT a number Eve can read`,
      );
    }

    console.log('\nWhat the personas know (wallet-side plaintext, verified by every proof):');
    console.log(`  Alice spendable ${fmt(cast.alice.spendable)} · Bob spendable ${fmt(cast.bob.spendable)}`);

    // The honest checks: public supply matches; the hidden balances were
    // verified by the circuits themselves (assertDecryptsTo in every debit).
    if (decoded._totalSupply !== 50_000n) throw new Error(`supply mismatch: ${decoded._totalSupply}`);
    if (cast.alice.spendable !== 25_000n || cast.bob.spendable !== 25_000n) {
      throw new Error('wallet-side tracking mismatch');
    }

    console.log('\nOK — confidential lifecycle complete: issue, sweep, transfer, sweep, redeem.');
    console.log('Balances and the transfer amount never appeared on chain; supply and the');
    console.log('counterparty graph did — exactly the disclosure profile this option promises.');
  } finally {
    await Promise.all(Object.values(sessions).map((s) => s.wallet.wallet.stop()));
  }
}

main().catch((error: unknown) => {
  console.error('\nfailed:', error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
