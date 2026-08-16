/**
 * Direct DUST sponsorship — the two-stage transaction flow.
 *
 * The ordering IS the security model:
 *
 *   1. The USER proves the call, balances ONLY their own token kinds
 *      (`tokenKindsToBalance: ['shielded', 'unshielded']` — never DUST),
 *      signs, and finalizes. Finalizing BINDS the transaction.
 *   2. The SPONSOR receives the bound transaction and can do exactly one
 *      thing: `balanceFinalizedTransaction(tx, …, { tokenKindsToBalance:
 *      ['dust'] })` — attach the fee. It cannot alter the call, the proof,
 *      or the user's coins. Then sign its fee addition, finalize, submit.
 *
 * Who pays and who is authorized become two different questions: the payer
 * cannot act (contract authorization needs the user's secret) and the actor
 * cannot pay (they hold no DUST — and never need any).
 *
 * Canonical reference: midnight-wallet packages/docs-snippets
 * dust-sponsorship.ts, mirrored here against wallet-sdk 2.0.0-beta.2.
 */

import type { MidnightWallet } from './index.ts';
import { emitTxStage } from './txStages.ts';

const DEFAULT_TTL_MS = 15 * 60 * 1000;
const ttl = () => new Date(Date.now() + DEFAULT_TTL_MS);

type Facade = MidnightWallet['wallet'];
type FinalizedTx = Parameters<Facade['balanceFinalizedTransaction']>[0];
type TransferOutputs = Parameters<Facade['transferTransaction']>[0];

const keysOf = (mw: MidnightWallet) => ({
  shieldedSecretKeys: mw.shieldedSecretKeys,
  dustSecretKey: mw.dustSecretKey,
});

/**
 * Sponsor side, complete: attach the DUST fee to a BOUND transaction, sign the
 * fee addition, submit. This is all a sponsor can do — the interesting
 * property is what this function *cannot* express.
 */
export async function sponsorAndSubmit(
  sponsor: MidnightWallet,
  boundTx: FinalizedTx,
): Promise<string> {
  emitTxStage('sponsor: balancing DUST only — attaching the fee to the bound transaction');
  const recipe = await sponsor.wallet.balanceFinalizedTransaction(boundTx, keysOf(sponsor), {
    ttl: ttl(),
    tokenKindsToBalance: ['dust'],
  });
  const signed = await sponsor.wallet.signRecipe(recipe, sponsor.keystore.signDataAsync);
  const finalized = await sponsor.wallet.finalizeRecipe(signed);
  emitTxStage('sponsor: fee attached and signed — submitting');
  const txId = await sponsor.wallet.submitTransaction(finalized);
  return String(txId);
}

/**
 * Wallet-level transfer, sponsored: the user builds it with `payFees: false`,
 * signs and binds; the sponsor pays. Works for any token type the user holds.
 */
export async function sponsoredTransfer(
  user: MidnightWallet,
  sponsor: MidnightWallet,
  outputs: TransferOutputs,
): Promise<string> {
  emitTxStage('user: building transfer with payFees disabled — no DUST involved');
  const recipe = await user.wallet.transferTransaction(outputs, keysOf(user), {
    ttl: ttl(),
    payFees: false,
  });
  const signed = await user.wallet.signRecipe(recipe, user.keystore.signDataAsync);
  const bound = await user.wallet.finalizeRecipe(signed);
  emitTxStage('user: transaction signed and BOUND — handing to the sponsor');
  return sponsorAndSubmit(sponsor, bound);
}

/**
 * The two midnight-js adapters, sponsored. Drop these into any provider set
 * and every contract transaction built on it (deploys included) follows the
 * two-stage flow: the user's adapter balances without DUST and binds; the
 * "submit" adapter is the sponsor attaching the fee and submitting.
 *
 * The user stays the prover throughout — proving already happened (locally)
 * by the time balanceTx runs, and no secret ever reaches the sponsor.
 */
export function sponsoredAdapters(user: MidnightWallet, sponsor: MidnightWallet) {
  return {
    balanceTx: async (tx: Parameters<Facade['balanceUnboundTransaction']>[0], txTtl?: Date) => {
      emitTxStage('user: balancing own tokens only (shielded + unshielded) — never DUST');
      const recipe = await user.wallet.balanceUnboundTransaction(tx, keysOf(user), {
        ttl: txTtl ?? ttl(),
        tokenKindsToBalance: ['shielded', 'unshielded'],
      });
      const bound = await user.wallet.finalizeRecipe(recipe);
      emitTxStage('user: transaction BOUND — the sponsor can only add a fee now');
      return bound;
    },
    submitTx: (tx: FinalizedTx) => sponsorAndSubmit(sponsor, tx),
  };
}

/**
 * Wrap an existing midnight-js provider set so every transaction built on it
 * is sponsored. The user's four infrastructure providers (indexer, prover, ZK
 * assets, private state) stay untouched — proving in particular remains the
 * USER'S — only the balance and submit adapters change hands.
 */
export function withSponsoredProviders<P extends object>(
  providers: P,
  user: MidnightWallet,
  sponsor: MidnightWallet,
): P {
  const adapters = sponsoredAdapters(user, sponsor);
  const p = providers as P & { walletProvider: object };
  return {
    ...p,
    walletProvider: { ...p.walletProvider, balanceTx: adapters.balanceTx },
    midnightProvider: { submitTx: adapters.submitTx },
  };
}
