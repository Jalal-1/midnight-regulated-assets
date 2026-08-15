/**
 * Design option 1, live: the PUBLIC contract token.
 *
 * Runs the deposit lifecycle on the owner-controlled public token
 * (contract/public-token.compact — OZ FungibleToken gated by OZ Ownable):
 *
 *   issue     Meridian (the issuer) mints deposits to Alice
 *   transfer  Alice pays Bob
 *   redeem    Meridian burns Alice's remaining deposit
 *
 * and then makes the point of this design option: EVE — who has no wallet, no
 * keys, and no relationship with anyone involved — reads every balance, the
 * total supply, and the owner, straight from public state. On this composition
 * the public sees exactly what the regulator sees. That is the checklist
 * failure the confidential options exist to fix.
 *
 * Identity: accountId = persistentHash(secretKey), the OZ witness scheme. Each
 * persona's token secret key is derived deterministically from their localnet
 * genesis seed, so account ids are stable across runs. Note what this implies:
 * BOB NEEDS NO WALLET TO RECEIVE — a recipient is just an account id. Bob only
 * needs his key (and DUST for fees) when he later spends.
 *
 * Run:   node --experimental-strip-types apps/tokenised-deposit/src/design-options/public-token.ts
 * Needs: a running localnet (`yarn localnet:up`) and compiled contracts
 *        (`yarn redeploy`).
 */

import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CompactTypeBytes,
  CompactTypeVector,
  persistentHash,
  type WitnessContext,
} from '@midnight-ntwrk/compact-runtime';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import {
  breakdownWindow,
  describeBreakdown,
  getNetwork,
  LOCALNET_GENESIS_SEEDS,
  meterProving,
  type ProvingMeter,
} from '@mra/network';
import { configureNetworkId, createWalletFromSeed, type MidnightWallet } from '@mra/wallet';
import { createProviders } from '@mra/wallet/providers';

import {
  Contract,
  ledger,
  type ContractAddress,
  type Either,
  type Ledger,
} from '../../contract/managed/public-token/contract/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ZK_CONFIG_PATH = resolve(HERE, '../../contract/managed/public-token');

const PRIVATE_STATE_PASSWORD = process.env.MRA_PRIVATE_STATE_PASSWORD ?? 'Localnet-Dev-Pw-2026!';

type CircuitId = 'mint' | 'burn' | 'transfer' | 'balanceOf' | 'totalSupply' | 'owner';

// --- Personas -----------------------------------------------------------------
//
// Meridian (issuer) and Alice submit transactions, so they get funded wallets
// from the localnet genesis seeds. Bob receives without a wallet. Eve reads
// without so much as a key.

const PERSONAS = { meridian: 0, alice: 1 } as const;

/**
 * A persona's token secret key, derived from their wallet seed.
 *
 * Deterministic on purpose: the same persona gets the same on-chain account id
 * every run, so history and balances line up across localnet sessions. The
 * derivation is domain-separated from the wallet seed so the token identity
 * key is never the wallet key itself.
 */
function tokenSecretKey(seed: string): Uint8Array {
  return new Uint8Array(createHash('sha256').update(`mra:public-token:sk:${seed}`).digest());
}

/** accountId = persistentHash(secretKey) — must match OZ Utils.computeAccountId. */
function accountId(secretKey: Uint8Array): Uint8Array {
  return persistentHash(new CompactTypeVector(1, new CompactTypeBytes(32)), [secretKey]);
}

type Account = Either<Uint8Array, ContractAddress>;

/** The contract's account type: a Bytes<32> id in the left branch. */
function asAccount(id: Uint8Array): Account {
  return { is_left: true, left: id, right: { bytes: new Uint8Array(32) } };
}

/**
 * Both OZ modules authenticate the caller the same way: a witness hands the
 * secret key to the circuit, which hashes it into the account id. The private
 * state itself is unused — passed through untouched.
 */
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
    CompiledContract.withCompiledFileAssets(ZK_CONFIG_PATH),
  );
}

// --- Reads: what ANYONE can see ------------------------------------------------
//
// Eve decodes the contract's ledger state straight off the indexer. No wallet,
// no keys, no transaction, no proof — and no circuit either: the contract
// re-exports the modules' ledger fields, so `ledger()` hands her the FULL
// balances map to enumerate, not just balances she thinks to ask about. This
// is the mechanics of "public state": the chain cannot tell Eve apart from
// Rita, and neither of them had to ask permission.

async function readAsEve(address: string): Promise<Ledger> {
  const network = getNetwork();
  const publicData = indexerPublicDataProvider(network.indexer, network.indexerWs);
  const state = await publicData.queryContractState(address);
  if (!state) throw new Error(`no contract state at ${address}`);
  return ledger(state.data);
}

// --- Lifecycle ------------------------------------------------------------------

function fmt(units: bigint): string {
  return `${(Number(units) / 100).toFixed(2)} mUSD`;
}

function step(meter: ProvingMeter, label: string): () => void {
  const startedAt = Date.now();
  const callsBefore = meter.calls().length;
  console.log(`\n${label}…`);
  return () => {
    const b = breakdownWindow(meter, callsBefore, startedAt, Date.now());
    console.log(`  done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
    if (b) console.log(`  ${describeBreakdown(b)}`);
  };
}

async function main(): Promise<void> {
  const network = getNetwork();
  if ((process.env.MRA_NETWORK ?? 'localnet') !== 'localnet') {
    throw new Error('localnet-only: uses well-known genesis seeds. Use the faucet on Stagenet.');
  }
  console.log(`network ${network.networkId}`);
  await configureNetworkId(network);
  const meter = meterProving(network.proofServer);

  // Identities first — they exist before any chain interaction.
  const keys = {
    meridian: tokenSecretKey(LOCALNET_GENESIS_SEEDS[PERSONAS.meridian]),
    alice: tokenSecretKey(LOCALNET_GENESIS_SEEDS[PERSONAS.alice]),
    bob: tokenSecretKey('bob-needs-no-wallet-to-receive'),
  };
  const ids = {
    meridian: asAccount(accountId(keys.meridian)),
    alice: asAccount(accountId(keys.alice)),
    bob: asAccount(accountId(keys.bob)),
  };

  const wallets: MidnightWallet[] = [];
  const sessionFor = async (persona: 'meridian' | 'alice') => {
    const seed = LOCALNET_GENESIS_SEEDS[PERSONAS[persona]];
    const wallet = await createWalletFromSeed(seed, network);
    wallets.push(wallet);
    await wallet.wallet.waitForSyncedState();
    const providers = await createProviders<CircuitId>({
      network,
      wallet,
      zkConfigPath: ZK_CONFIG_PATH,
      privateStateStoreName: 'tokenised-deposit-design-options',
      accountId: `public-token-${persona}`,
      privateStatePassword: PRIVATE_STATE_PASSWORD,
    });
    return providers;
  };

  try {
    console.log('building wallets (Meridian issues, Alice pays; Bob and Eve need none)…');
    const meridian = await sessionFor('meridian');
    const alice = await sessionFor('alice');

    // Deploy as Meridian, who is also the initial owner.
    let done = step(meter, 'deploy public-token (Meridian is owner)');
    const deployed = await deployContract(meridian, {
      compiledContract: compiledFor(keys.meridian),
      args: ['Meridian Deposit Token', 'mUSD', 2n, ids.meridian],
    });
    done();
    const address = deployed.deployTxData.public.contractAddress;
    console.log(`  address ${address}`);

    // ISSUE — mint 1,000.00 mUSD to Alice against the (mocked) core-ledger liability.
    done = step(meter, `issue: Meridian mints ${fmt(100_000n)} to Alice`);
    await deployed.callTx.mint(ids.alice, 100_000n);
    done();

    // TRANSFER — Alice pays Bob 250.00 mUSD. Note the recipient is only an id.
    done = step(meter, `transfer: Alice pays Bob ${fmt(25_000n)}`);
    const aliceToken = await findDeployedContract(alice, {
      contractAddress: address,
      compiledContract: compiledFor(keys.alice),
    });
    await aliceToken.callTx.transfer(ids.bob, 25_000n);
    done();

    // REDEEM — Meridian burns 500.00 mUSD of Alice's deposit (core ledger credits her).
    done = step(meter, `redeem: Meridian burns ${fmt(50_000n)} from Alice`);
    await deployed.callTx.burn(ids.alice, 50_000n);
    done();

    // THE POINT — Eve, with no wallet and no keys, enumerates everything.
    console.log('\nEve (public observer, no wallet, no keys) reads the ledger:');
    const eve = await readAsEve(address);
    const label = (key: Uint8Array) => {
      const hex = Buffer.from(key).toString('hex');
      if (hex === Buffer.from(ids.alice.left).toString('hex')) return 'Alice   ';
      if (hex === Buffer.from(ids.bob.left).toString('hex')) return 'Bob     ';
      if (hex === Buffer.from(ids.meridian.left).toString('hex')) return 'Meridian';
      return `${hex.slice(0, 8)}…`;
    };
    const seen = new Map<string, bigint>();
    for (const [account, balance] of eve._balances) {
      console.log(`  ${label(account.left)} ${fmt(balance)}`);
      seen.set(Buffer.from(account.left).toString('hex'), balance);
    }
    console.log(`  supply   ${fmt(eve._totalSupply)}`);
    console.log(`  owner    ${Buffer.from(eve._owner.left).toString('hex').slice(0, 16)}… (Meridian)`);
    console.log('\nEve did not query balances she knew about — she ENUMERATED the map.');
    console.log('On this composition the public sees what the regulator sees, holder');
    console.log('list included. That is the checklist failure.');

    const bal = (account: Account) => seen.get(Buffer.from(account.left).toString('hex')) ?? 0n;
    if (bal(ids.alice) !== 25_000n || bal(ids.bob) !== 25_000n || eve._totalSupply !== 50_000n) {
      throw new Error(
        `balance mismatch: alice=${bal(ids.alice)} bob=${bal(ids.bob)} ` +
          `supply=${eve._totalSupply}, expected 25000/25000/50000`,
      );
    }
    console.log('\nOK — issue, transfer, redeem, and the public enumeration all verified.');
  } finally {
    await Promise.all(wallets.map((w) => w.wallet.stop()));
  }
}

main().catch((error: unknown) => {
  console.error('\nfailed:', error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
