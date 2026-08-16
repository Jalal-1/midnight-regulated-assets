/**
 * The studio's chain bridge — every number and hash the studio shows comes
 * through here, and none of it is simulated.
 *
 * Four deployable token kinds, all real:
 *   'utxo'          — the unshielded UTXO token: the contract mints NATIVE
 *                     coins; every movement after that is wallet-level and
 *                     fully public.
 *   'public'        — the unshielded contract token (FungibleToken + Ownable):
 *                     balances in public contract state, read straight off the
 *                     indexer.
 *   'zswap'         — the ZSwap shielded UTXO token: the contract mints into
 *                     the shielded pool; the chain sees commitments, and
 *                     transfers hide amount, sender and recipient.
 *   'confidential'  — the CFT: encrypted balances, hidden amounts, public
 *                     supply; wallet-side plaintext tracked in memory and
 *                     verified by every proof.
 *
 * The deployment pipeline's steps are actual transactions completing live;
 * issue/transfer/redeem carry real ids and measured durations. On the
 * confidential token, the recipient's required sweep runs as its own real,
 * logged transaction. On the UTXO kinds, "redeem" is a wallet transfer BACK to
 * the issuer — bearer instruments have no burn, and the studio says so.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { currentNetwork } from '@mra/lab-shell';
import { formatDust, formatNight, onTxStage, prepareHostedWallet } from '@mra/wallet';

import {
  connectCftPersona,
  deployCft,
  hex,
  mintCft,
  readCftView,
  redeemCft,
  registerCft,
  sweepCft,
  transferCft,
  type CftSession,
} from '../labs/confidentialToken.ts';
import {
  awaitSpendableUtxo,
  connectUtxoPersona,
  deployUtxoToken,
  mintUtxo,
  readUtxoView,
  utxoBalanceOf,
  walletTransferUtxo,
  type UtxoSession,
} from '../labs/utxoTokens.ts';
import {
  accountId,
  asAccount,
  burn as burnPublic,
  connectPersona as connectPublicPersona,
  deployToken as deployPublic,
  mint as mintPublic,
  readPublicView,
  transfer as transferPublic,
  type TokenSession,
} from '../labs/publicToken.ts';

export type TokenKind = 'utxo' | 'public' | 'zswap' | 'confidential';
export type PersonaId = 'acme' | 'alice' | 'bob';
export const PERSONA_LABEL: Record<PersonaId, string> = {
  acme: 'ACME Bank treasury',
  alice: 'Alice',
  bob: 'Bob',
};

export interface ActivityEvent {
  readonly t: string;
  readonly label: string;
  readonly note: string;
  readonly tx: string;
}

export type StepState = 'pending' | 'running' | 'done' | 'failed';

export interface DeployStep {
  readonly id: string;
  readonly label: string;
  readonly tech: string;
  readonly state: StepState;
  readonly detail?: string;
  /** Live sub-stage log — every line is emitted by the code doing that work. */
  readonly sub: readonly string[];
}

const STEPS: Record<TokenKind, readonly Omit<DeployStep, 'state' | 'detail' | 'sub'>[]> = {
  confidential: [
    { id: 'wallets', label: 'Preparing issuer environment', tech: 'wallets built from seeds · roles derived · DUST available' },
    { id: 'deploy', label: 'Deploying the asset contract', tech: 'proved locally · submitted · block inclusion' },
    { id: 'registerAlice', label: 'Registering Alice for confidential receiving', tech: 'encryption key published on-chain (proved transaction)' },
    { id: 'registerBob', label: 'Registering Bob for confidential receiving', tech: 'encryption key published on-chain (proved transaction)' },
  ],
  public: [
    { id: 'wallets', label: 'Preparing issuer environment', tech: 'wallets built from seeds · roles derived · DUST available' },
    { id: 'deploy', label: 'Deploying the asset contract', tech: 'proved locally · submitted · block inclusion' },
  ],
  utxo: [
    { id: 'wallets', label: 'Preparing issuer environment', tech: 'wallets built from seeds · roles derived · DUST available' },
    { id: 'deploy', label: 'Deploying the mint contract', tech: 'proved locally · submitted · block inclusion — coins it mints are ledger-native' },
  ],
  zswap: [
    { id: 'wallets', label: 'Preparing issuer environment', tech: 'wallets built from seeds · roles derived · DUST available' },
    { id: 'deploy', label: 'Deploying the shielded mint contract', tech: 'proved locally · submitted · block inclusion — coins it mints live in the shielded pool' },
  ],
};

const isUtxoKind = (k: TokenKind): k is 'utxo' | 'zswap' => k === 'utxo' || k === 'zswap';

const now = () => new Date().toTimeString().slice(0, 8);
const shortTx = (tx: string) => `${tx.slice(0, 10)}…`;
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** One shape for both kinds — the dashboard renders from this. */
export interface StudioView {
  readonly symbol: string;
  readonly decimals: number;
  readonly totalSupply: bigint;
  /** Confidential only: registered account count (public data). Null for public kind. */
  readonly registeredCount: number | null;
  /** Public kind only: the enumerable holder list, straight off the indexer. */
  readonly holders: readonly { id: string; balance: bigint }[] | null;
}

interface AnySessions {
  kind: TokenKind;
  cft: Partial<Record<PersonaId, CftSession>>;
  pub: Partial<Record<PersonaId, TokenSession>>;
  utxo: Partial<Record<PersonaId, UtxoSession>>;
  /** UTXO kinds only: the raw token type minted by the deployed contract. */
  tokenType: string | null;
}

export interface StudioChain {
  readonly kind: TokenKind;
  readonly address: string | null;
  readonly view: StudioView | null;
  readonly activity: readonly ActivityEvent[];
  readonly deploySteps: readonly DeployStep[];
  readonly busy: boolean;
  readonly opErr: string | null;
  /** Live sub-stage of the operation in flight (proving, balancing, …). */
  readonly opStage: string | null;
  readonly lastOp: { label: string; tx: string; ms: number } | null;
  readonly issuedTotal: bigint;
  readonly redeemedTotal: bigint;
  /** Holder balances by persona. Public kind: chain-read. Confidential: wallet-side. */
  readonly balances: Readonly<Partial<Record<'alice' | 'bob', bigint>>>;
  /** Confidential only: pending (unswept) amounts, wallet-side. */
  readonly pending: Readonly<Partial<Record<'alice' | 'bob', bigint>>>;
  readonly registered: (who: 'alice' | 'bob') => boolean;
  readonly walletAddress: (who: PersonaId) => string | null;
  readonly walletOf: (who: PersonaId) => CftSession['wallet'] | TokenSession['wallet'] | null;
  readonly accountIdHex: (who: PersonaId) => string | null;
  readonly runDeployment: (
    kind: TokenKind,
    naming: { name: string; symbol: string },
    seeds?: Record<PersonaId, string>,
  ) => Promise<boolean>;
  readonly issue: (to: 'alice' | 'bob', units: bigint) => Promise<void>;
  readonly transfer: (from: 'alice' | 'bob', to: 'alice' | 'bob', units: bigint) => Promise<void>;
  readonly redeem: (from: 'alice' | 'bob', units: bigint) => Promise<void>;
  readonly clearOp: () => void;
  readonly reset: () => void;
}

export function useStudioChain(): StudioChain {
  const [kind, setKind] = useState<TokenKind>('confidential');
  const [address, setAddress] = useState<string | null>(null);
  const [view, setView] = useState<StudioView | null>(null);
  const [registeredIds, setRegisteredIds] = useState<readonly string[]>([]);
  const [activity, setActivity] = useState<readonly ActivityEvent[]>([]);
  const [deploySteps, setDeploySteps] = useState<readonly DeployStep[]>(
    STEPS.confidential.map((s) => ({ ...s, state: 'pending' as const, sub: [] })),
  );
  const [opStage, setOpStage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [opErr, setOpErr] = useState<string | null>(null);
  const [lastOp, setLastOp] = useState<{ label: string; tx: string; ms: number } | null>(null);
  const [issuedTotal, setIssuedTotal] = useState(0n);
  const [redeemedTotal, setRedeemedTotal] = useState(0n);
  const [, setTick] = useState(0);
  const [utxoBalances, setUtxoBalances] = useState<Partial<Record<'alice' | 'bob', bigint>>>({});
  // Poll results can resolve out of order; only the newest read may write.
  const balSeqRef = useRef(0);
  const sessionsRef = useRef<AnySessions>({ kind: 'confidential', cft: {}, pub: {}, utxo: {}, tokenType: null });

  const log = useCallback((label: string, note: string, tx: string) => {
    setActivity((prev) => [{ t: now(), label, note, tx }, ...prev]);
  }, []);

  const refreshView = useCallback(async (at: string, forKind: TokenKind) => {
    if (forKind === 'confidential') {
      const v = await readCftView(at);
      if (!v) return;
      setRegisteredIds(v.registered.map(hex));
      setView({
        symbol: v.symbol,
        decimals: v.decimals,
        totalSupply: v.totalSupply,
        registeredCount: v.registered.length,
        holders: null,
      });
    } else if (forKind === 'public') {
      const v = await readPublicView(at);
      if (!v) return;
      setView({
        symbol: v.symbol,
        decimals: v.decimals,
        totalSupply: v.totalSupply,
        registeredCount: null,
        holders: v.holdings.map((h) => ({ id: hex(h.account), balance: h.balance })),
      });
    } else {
      const v = await readUtxoView(forKind, at);
      if (!v) return;
      setView({
        symbol: v.symbol,
        decimals: 2,
        totalSupply: v.minted,
        registeredCount: null,
        holders: null,
      });
      const s = sessionsRef.current;
      if (s.tokenType) {
        const seq = ++balSeqRef.current;
        const next: Partial<Record<'alice' | 'bob', bigint>> = {};
        for (const persona of ['alice', 'bob'] as const) {
          const session = s.utxo[persona];
          if (session) next[persona] = await utxoBalanceOf(forKind, session, s.tokenType);
        }
        if (seq === balSeqRef.current) setUtxoBalances(next);
      }
    }
  }, []);

  useEffect(() => {
    if (!address) return;
    const tick = () => refreshView(address, sessionsRef.current.kind).catch(() => {});
    void tick();
    const timer = setInterval(tick, 5000);
    return () => clearInterval(timer);
  }, [address, refreshView]);

  const step = useCallback((id: string, state: StepState, detail?: string) => {
    setDeploySteps((prev) => prev.map((s) => (s.id === id ? { ...s, state, detail } : s)));
  }, []);

  const subStep = useCallback((id: string, message: string) => {
    const line = `${now()}  ${message}`;
    setDeploySteps((prev) => prev.map((s) => (s.id === id ? { ...s, sub: [...s.sub, line] } : s)));
  }, []);

  const runDeployment = useCallback(
    async (
      deployKind: TokenKind,
      naming: { name: string; symbol: string },
      seeds?: Record<PersonaId, string>,
    ): Promise<boolean> => {
      setBusy(true);
      setOpErr(null);
      setKind(deployKind);
      sessionsRef.current = { kind: deployKind, cft: {}, pub: {}, utxo: {}, tokenType: null };
      setUtxoBalances({});
      setDeploySteps(STEPS[deployKind].map((s) => ({ ...s, state: 'pending' as const, sub: [] })));
      // Route the providers' live stage events into whichever step is active.
      let activeStep = 'wallets';
      const offStages = onTxStage((m) => {
        step(activeStep, 'running', m);
        subStep(activeStep, m);
      });
      try {
        step('wallets', 'running');
        for (const persona of ['acme', 'alice', 'bob'] as const) {
          const progress = (m: string) => {
            step('wallets', 'running', `${PERSONA_LABEL[persona]}: ${m}`);
            subStep('wallets', `${PERSONA_LABEL[persona]}: ${m}`);
          };
          if (deployKind === 'confidential') {
            sessionsRef.current.cft[persona] = await connectCftPersona(persona, seeds?.[persona], progress);
          } else if (deployKind === 'public') {
            sessionsRef.current.pub[persona] = await connectPublicPersona(persona, seeds?.[persona], progress);
          } else {
            sessionsRef.current.utxo[persona] = await connectUtxoPersona(deployKind, persona, seeds?.[persona], progress);
          }
          subStep('wallets', `${PERSONA_LABEL[persona]}: wallet ready`);
        }
        if (currentNetwork().networkId !== 'undeployed') {
          // Hosted network: nothing works until each wallet is faucet-funded,
          // DUST-registered, and holds enough DUST to pay fees. Gate here — in
          // parallel, so all three faucet rows can be handled in one sitting.
          step('wallets', 'running', 'waiting for faucet funds — fund each address in the rows below');
          subStep('wallets', 'waiting for faucet funds on all three wallets — fund each address below');
          const sessionOf = (persona: PersonaId) =>
            deployKind === 'confidential'
              ? sessionsRef.current.cft[persona]!
              : deployKind === 'public'
                ? sessionsRef.current.pub[persona]!
                : sessionsRef.current.utxo[persona]!;
          await Promise.all(
            (['acme', 'alice', 'bob'] as const).map((persona) =>
              prepareHostedWallet(sessionOf(persona).wallet, {
                onProgress: (m) => subStep('wallets', `${PERSONA_LABEL[persona]}: ${m}`),
              }),
            ),
          );
          subStep('wallets', 'all three wallets funded, DUST-registered and fee-ready');
        }
        const issuer =
          deployKind === 'confidential'
            ? sessionsRef.current.cft.acme!
            : deployKind === 'public'
              ? sessionsRef.current.pub.acme!
              : sessionsRef.current.utxo.acme!;
        step(
          'wallets',
          'done',
          `issuer holds ${formatNight(issuer.unshieldedBalance)} NIGHT · ${formatDust(issuer.dustBalance(new Date()))} DUST`,
        );

        activeStep = 'deploy';
        step('deploy', 'running');
        let t = Date.now();
        let deployed: string;
        if (deployKind === 'confidential') {
          deployed = await deployCft(sessionsRef.current.cft.acme!, naming);
        } else if (deployKind === 'public') {
          deployed = await deployPublic(sessionsRef.current.pub.acme!, naming);
        } else {
          const r = await deployUtxoToken(deployKind, sessionsRef.current.utxo.acme!, naming);
          deployed = r.address;
          sessionsRef.current.tokenType = r.tokenType;
        }
        setAddress(deployed);
        step('deploy', 'done', `address ${deployed.slice(0, 12)}… · ${seconds(Date.now() - t)}`);
        log(`Deployed ${naming.name} (${naming.symbol})`, `proved + confirmed in ${seconds(Date.now() - t)}`, deployed.slice(0, 10));

        if (deployKind === 'confidential') {
          for (const persona of ['alice', 'bob'] as const) {
            const id = persona === 'alice' ? 'registerAlice' : 'registerBob';
            activeStep = id;
            step(id, 'running');
            t = Date.now();
            const tx = await registerCft(sessionsRef.current.cft[persona]!, deployed);
            step(id, 'done', `tx ${shortTx(tx.txId)} · ${seconds(Date.now() - t)}`);
            log(
              `Registered ${PERSONA_LABEL[persona]} for confidential receiving`,
              `proved + confirmed in ${seconds(Date.now() - t)}`,
              shortTx(tx.txId),
            );
          }
        }
        await refreshView(deployed, deployKind);
        setBusy(false);
        return true;
      } catch (error) {
        const message = String((error as Error)?.message ?? error).slice(0, 240);
        setDeploySteps((prev) =>
          prev.map((s) => (s.state === 'running' ? { ...s, state: 'failed', detail: message } : s)),
        );
        setOpErr(`Deployment failed: ${message}`);
        setBusy(false);
        return false;
      } finally {
        offStages();
      }
    },
    [log, refreshView, step, subStep],
  );

  const run = useCallback(
    async (label: string, note: string, fn: () => Promise<{ txId: string }>): Promise<boolean> => {
      setBusy(true);
      setOpErr(null);
      const offStages = onTxStage((m) => setOpStage(m));
      const t = Date.now();
      try {
        const tx = await fn();
        const ms = Date.now() - t;
        log(label, `${note} · ${seconds(ms)}`, shortTx(tx.txId));
        setLastOp({ label, tx: shortTx(tx.txId), ms });
        if (address) await refreshView(address, sessionsRef.current.kind).catch(() => {});
        setTick((n) => n + 1);
        return true;
      } catch (error) {
        setOpErr(`${label} failed: ${String((error as Error)?.message ?? error).slice(0, 240)}`);
        setLastOp(null);
        return false;
      } finally {
        offStages();
        setOpStage(null);
        setBusy(false);
      }
    },
    [address, log, refreshView],
  );

  const fmtUnits = (units: bigint) =>
    (Number(units) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const issue = useCallback(
    async (to: 'alice' | 'bob', units: bigint) => {
      const s = sessionsRef.current;
      if (!address) return;
      const sym = view?.symbol ?? '';
      if (s.kind === 'confidential') {
        if (!s.cft.acme || !s.cft[to]) return;
        const ok = await run(
          `Issued ${fmtUnits(units)} ${sym} to ${PERSONA_LABEL[to]}`,
          'mint under issuer authority — supply delta is public',
          () => mintCft(s.cft.acme!, address, s.cft[to]!.tokenWallet, units),
        );
        if (!ok) return;
        await run(
          `${PERSONA_LABEL[to]} swept incoming funds to spendable`,
          'recipient sweep — the confidential model requires it',
          () => sweepCft(s.cft[to]!, address),
        );
      } else if (s.kind === 'public') {
        if (!s.pub.acme || !s.pub[to]) return;
        await run(
          `Issued ${fmtUnits(units)} ${sym} to ${PERSONA_LABEL[to]}`,
          'mint under issuer authority — amount and balance are public',
          () => mintPublic(s.pub.acme!, address, asAccount(accountId(s.pub[to]!.secretKey)), units),
        );
      } else {
        if (!s.utxo.acme || !s.utxo[to]) return;
        await run(
          `Issued ${fmtUnits(units)} ${sym} to ${PERSONA_LABEL[to]}`,
          s.kind === 'utxo'
            ? 'owner-gated mint of native coins, straight into the wallet — fully public'
            : 'owner-gated mint into the shielded pool — the chain records a commitment',
          () => mintUtxo(s.kind as 'utxo' | 'zswap', s.utxo.acme!, address, s.utxo[to]!, units),
        );
      }
    },
    [address, run, view],
  );

  const transfer = useCallback(
    async (from: 'alice' | 'bob', to: 'alice' | 'bob', units: bigint) => {
      const s = sessionsRef.current;
      if (!address || from === to) {
        if (from === to) setOpErr('Choose two different participants.');
        return;
      }
      const sym = view?.symbol ?? '';
      if (s.kind === 'confidential') {
        if (!s.cft[from] || !s.cft[to]) return;
        const have = s.cft[from]!.tokenWallet.spendable;
        if (units > have) {
          setOpErr(`Insufficient spendable balance — ${PERSONA_LABEL[from]} holds ${fmtUnits(have)} ${sym}.`);
          return;
        }
        const ok = await run(
          `Transferred ${fmtUnits(units)} ${sym} — ${PERSONA_LABEL[from]} → ${PERSONA_LABEL[to]}`,
          'value hidden on the public ledger',
          () => transferCft(s.cft[from]!, address, s.cft[to]!.tokenWallet, units),
        );
        if (!ok) return;
        await run(
          `${PERSONA_LABEL[to]} swept incoming funds to spendable`,
          'recipient sweep — the confidential model requires it',
          () => sweepCft(s.cft[to]!, address),
        );
      } else if (s.kind === 'public') {
        if (!s.pub[from] || !s.pub[to]) return;
        await run(
          `Transferred ${fmtUnits(units)} ${sym} — ${PERSONA_LABEL[from]} → ${PERSONA_LABEL[to]}`,
          'amount and both balances are public',
          () => transferPublic(s.pub[from]!, address, asAccount(accountId(s.pub[to]!.secretKey)), units),
        );
      } else {
        if (!s.utxo[from] || !s.utxo[to] || !s.tokenType) return;
        const kind = s.kind as 'utxo' | 'zswap';
        await run(
          `Transferred ${fmtUnits(units)} ${sym} — ${PERSONA_LABEL[from]} → ${PERSONA_LABEL[to]}`,
          kind === 'utxo'
            ? 'wallet-to-wallet, no contract involved — amount and parties are public'
            : 'wallet-to-wallet through the shielded pool — amount, sender and recipient hidden',
          async () => {
            const have = await awaitSpendableUtxo(kind, s.utxo[from]!, s.tokenType!, units);
            if (units > have) {
              throw new Error(`insufficient balance — ${PERSONA_LABEL[from]} holds ${fmtUnits(have)} ${sym}`);
            }
            return walletTransferUtxo(kind, s.utxo[from]!, s.tokenType!, s.utxo[to]!, units);
          },
        );
      }
    },
    [address, run, view],
  );

  const redeem = useCallback(
    async (from: 'alice' | 'bob', units: bigint) => {
      const s = sessionsRef.current;
      if (!address) return;
      const sym = view?.symbol ?? '';
      if (s.kind === 'confidential') {
        if (!s.cft[from]) return;
        const have = s.cft[from]!.tokenWallet.spendable;
        if (units > have) {
          setOpErr(`Insufficient spendable balance — ${PERSONA_LABEL[from]} holds ${fmtUnits(have)} ${sym}.`);
          return;
        }
        await run(
          `Redeemed ${fmtUnits(units)} ${sym} from ${PERSONA_LABEL[from]}`,
          'burned against the issuer — supply delta is public',
          () => redeemCft(s.cft[from]!, address, units),
        );
      } else if (s.kind === 'public') {
        if (!s.pub.acme || !s.pub[from]) return;
        await run(
          `Redeemed ${fmtUnits(units)} ${sym} from ${PERSONA_LABEL[from]}`,
          'burned by the issuer — amount and balance are public',
          () => burnPublic(s.pub.acme!, address, asAccount(accountId(s.pub[from]!.secretKey)), units),
        );
      } else {
        if (!s.utxo.acme || !s.utxo[from] || !s.tokenType) return;
        const kind = s.kind as 'utxo' | 'zswap';
        await run(
          `Returned ${fmtUnits(units)} ${sym} to the issuer — from ${PERSONA_LABEL[from]}`,
          kind === 'utxo'
            ? 'bearer coins have no burn — redemption is a public transfer back to the issuer'
            : 'bearer coins have no burn — redemption is a shielded transfer back to the issuer',
          async () => {
            const have = await awaitSpendableUtxo(kind, s.utxo[from]!, s.tokenType!, units);
            if (units > have) {
              throw new Error(`insufficient balance — ${PERSONA_LABEL[from]} holds ${fmtUnits(have)} ${sym}`);
            }
            return walletTransferUtxo(kind, s.utxo[from]!, s.tokenType!, s.utxo.acme!, units);
          },
        );
      }
    },
    [address, run, view],
  );

  useEffect(() => {
    let issued = 0n;
    let redeemed = 0n;
    for (const ev of activity) {
      const amount = ev.label.match(/^(Issued|Redeemed|Returned) ([\d,]+\.\d{2})/);
      if (!amount) continue;
      const units = BigInt(Math.round(parseFloat(amount[2]!.replace(/,/g, '')) * 100));
      if (amount[1] === 'Issued') issued += units;
      else redeemed += units;
    }
    setIssuedTotal(issued);
    setRedeemedTotal(redeemed);
  }, [activity]);

  const accountIdHex = (who: PersonaId): string | null => {
    const s = sessionsRef.current;
    if (s.kind === 'confidential') {
      const session = s.cft[who];
      return session ? hex(session.tokenWallet.id) : null;
    }
    if (s.kind === 'public') {
      const session = s.pub[who];
      return session ? hex(accountId(session.secretKey)) : null;
    }
    return null; // UTXO kinds have no contract-level account — the wallet address IS the identity
  };

  const balances: Partial<Record<'alice' | 'bob', bigint>> = {};
  const pending: Partial<Record<'alice' | 'bob', bigint>> = {};
  for (const persona of ['alice', 'bob'] as const) {
    if (sessionsRef.current.kind === 'confidential') {
      const s = sessionsRef.current.cft[persona];
      if (s) {
        balances[persona] = s.tokenWallet.spendable;
        pending[persona] = s.tokenWallet.pending;
      }
    } else if (sessionsRef.current.kind === 'public') {
      const id = accountIdHex(persona);
      const holder = view?.holders?.find((h) => h.id === id);
      if (id) balances[persona] = holder?.balance ?? 0n;
    } else if (sessionsRef.current.utxo[persona]) {
      balances[persona] = utxoBalances[persona] ?? 0n;
    }
  }

  const reset = useCallback(() => {
    sessionsRef.current = { kind: 'confidential', cft: {}, pub: {}, utxo: {}, tokenType: null };
    setUtxoBalances({});
    setKind('confidential');
    setAddress(null);
    setView(null);
    setRegisteredIds([]);
    setActivity([]);
    setDeploySteps(STEPS.confidential.map((s) => ({ ...s, state: 'pending' as const, sub: [] })));
    setOpStage(null);
    setOpErr(null);
    setLastOp(null);
    setIssuedTotal(0n);
    setRedeemedTotal(0n);
  }, []);

  return {
    kind,
    address,
    view,
    activity,
    deploySteps,
    busy,
    opErr,
    opStage,
    lastOp,
    issuedTotal,
    redeemedTotal,
    balances,
    pending,
    registered: (who) => {
      const id = accountIdHex(who);
      return !!id && registeredIds.includes(id);
    },
    walletAddress: (who) => {
      const s = sessionsRef.current;
      const session = s.kind === 'confidential' ? s.cft[who] : s.kind === 'public' ? s.pub[who] : s.utxo[who];
      return session?.unshieldedAddress ?? null;
    },
    walletOf: (who) => {
      const s = sessionsRef.current;
      const session = s.kind === 'confidential' ? s.cft[who] : s.kind === 'public' ? s.pub[who] : s.utxo[who];
      return session?.wallet ?? null;
    },
    accountIdHex,
    runDeployment,
    issue,
    transfer,
    redeem,
    clearOp: () => {
      setOpErr(null);
      setLastOp(null);
    },
    reset,
  };
}

export { currentNetwork, hex };
