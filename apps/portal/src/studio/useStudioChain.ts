/**
 * The studio's chain bridge — every number and hash the studio shows comes
 * through here, and none of it is simulated. Reuses the CFT lab's lifecycle
 * module (same contract, witnesses, wallets); the studio adds the pipeline
 * shape the design wants: a stepped deployment, activity with real tx ids and
 * measured durations, and auto-sweep so "issue" and "transfer" behave like the
 * product actions the design describes (each sweep is its own REAL transaction
 * and is logged as one).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { currentNetwork } from '@mra/lab-shell';
import { formatDust, formatNight } from '@mra/wallet';

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
  type CftView,
} from '../labs/confidentialToken.ts';

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
}

const DEPLOY_STEPS: readonly Omit<DeployStep, 'state' | 'detail'>[] = [
  { id: 'wallets', label: 'Preparing issuer environment', tech: 'wallets built from seeds · roles derived · DUST available' },
  { id: 'deploy', label: 'Deploying the asset contract', tech: 'proved locally · submitted · block inclusion' },
  { id: 'registerAlice', label: 'Registering Alice for confidential receiving', tech: 'encryption key published on-chain (proved transaction)' },
  { id: 'registerBob', label: 'Registering Bob for confidential receiving', tech: 'encryption key published on-chain (proved transaction)' },
];

const now = () => new Date().toTimeString().slice(0, 8);
const shortTx = (tx: string) => `${tx.slice(0, 10)}…`;
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

type Sessions = Partial<Record<PersonaId, CftSession>>;

export interface StudioChain {
  readonly sessions: Sessions;
  readonly address: string | null;
  readonly deployTx: string | null;
  readonly view: CftView | null;
  readonly activity: readonly ActivityEvent[];
  readonly deploySteps: readonly DeployStep[];
  readonly busy: boolean;
  readonly opErr: string | null;
  readonly lastOp: { label: string; tx: string; ms: number } | null;
  readonly issuedTotal: bigint;
  readonly redeemedTotal: bigint;
  readonly balances: Readonly<Record<string, bigint>>;
  readonly runDeployment: (
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
  const [sessions, setSessions] = useState<Sessions>({});
  const [address, setAddress] = useState<string | null>(null);
  const [deployTx, setDeployTx] = useState<string | null>(null);
  const [view, setView] = useState<CftView | null>(null);
  const [activity, setActivity] = useState<readonly ActivityEvent[]>([]);
  const [deploySteps, setDeploySteps] = useState<readonly DeployStep[]>(
    DEPLOY_STEPS.map((s) => ({ ...s, state: 'pending' as const })),
  );
  const [busy, setBusy] = useState(false);
  const [opErr, setOpErr] = useState<string | null>(null);
  const [lastOp, setLastOp] = useState<{ label: string; tx: string; ms: number } | null>(null);
  const [issuedTotal, setIssuedTotal] = useState(0n);
  const [redeemedTotal, setRedeemedTotal] = useState(0n);
  // Re-render tick so wallet-side (mutable CftWallet) balances refresh on screen.
  const [, setTick] = useState(0);
  const sessionsRef = useRef<Sessions>({});

  const log = useCallback((label: string, note: string, tx: string) => {
    setActivity((prev) => [{ t: now(), label, note, tx }, ...prev]);
  }, []);

  // Eve's poll — the PUBLIC view, straight off the indexer.
  useEffect(() => {
    if (!address) return;
    const tick = async () => {
      try {
        setView(await readCftView(address));
      } catch {
        /* transient — next poll */
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 5000);
    return () => clearInterval(timer);
  }, [address]);

  const step = useCallback((id: string, state: StepState, detail?: string) => {
    setDeploySteps((prev) => prev.map((s) => (s.id === id ? { ...s, state, detail } : s)));
  }, []);

  /**
   * The REAL deployment pipeline the design's deploy screen renders:
   * wallets (×3, with DUST setup on hosted networks) → deploy → register
   * Alice → register Bob. Every check mark is an actual completed step.
   */
  const runDeployment = useCallback(
    async (naming: { name: string; symbol: string }, seeds?: Record<PersonaId, string>): Promise<boolean> => {
      setBusy(true);
      setOpErr(null);
      setDeploySteps(DEPLOY_STEPS.map((s) => ({ ...s, state: 'pending' as const })));
      try {
        step('wallets', 'running');
        const started = Date.now();
        const next: Sessions = {};
        for (const persona of ['acme', 'alice', 'bob'] as const) {
          next[persona] = await connectCftPersona(persona, seeds?.[persona], (m) =>
            step('wallets', 'running', m),
          );
        }
        sessionsRef.current = next;
        setSessions(next);
        const acme = next.acme!;
        step(
          'wallets',
          'done',
          `issuer holds ${formatNight(acme.unshieldedBalance)} NIGHT · ${formatDust(acme.dustBalance(new Date()))} DUST`,
        );

        step('deploy', 'running');
        let t = Date.now();
        const deployed = await deployCft(acme, naming);
        setAddress(deployed);
        step('deploy', 'done', `address ${deployed.slice(0, 12)}… · ${seconds(Date.now() - t)}`);
        log(`Deployed ${naming.name} (${naming.symbol})`, `proved + confirmed in ${seconds(Date.now() - t)}`, deployed.slice(0, 10));
        setDeployTx(deployed);

        for (const persona of ['alice', 'bob'] as const) {
          const id = persona === 'alice' ? 'registerAlice' : 'registerBob';
          step(id, 'running');
          t = Date.now();
          const tx = await registerCft(next[persona]!, deployed);
          step(id, 'done', `tx ${shortTx(tx.txId)} · ${seconds(Date.now() - t)}`);
          log(
            `Registered ${PERSONA_LABEL[persona]} for confidential receiving`,
            `proved + confirmed in ${seconds(Date.now() - t)}`,
            shortTx(tx.txId),
          );
        }
        setView(await readCftView(deployed));
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
      }
    },
    [log, step],
  );

  /** One lifecycle op; refreshes the public view afterwards. */
  const run = useCallback(
    async (label: string, note: string, fn: () => Promise<{ txId: string }>): Promise<string | null> => {
      setBusy(true);
      setOpErr(null);
      const t = Date.now();
      try {
        const tx = await fn();
        const ms = Date.now() - t;
        log(label, `${note} · ${seconds(ms)}`, shortTx(tx.txId));
        setLastOp({ label, tx: shortTx(tx.txId), ms });
        if (address) setView(await readCftView(address));
        setTick((n) => n + 1);
        return tx.txId;
      } catch (error) {
        const message = String((error as Error)?.message ?? error).slice(0, 240);
        setOpErr(`${label} failed: ${message}`);
        setLastOp(null);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [address, log],
  );

  const fmtUnits = (units: bigint) =>
    (Number(units) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const issue = useCallback(
    async (to: 'alice' | 'bob', units: bigint) => {
      const s = sessionsRef.current;
      if (!s.acme || !s[to] || !address) return;
      const sym = view?.symbol ?? '';
      const ok = await run(
        `Issued ${fmtUnits(units)} ${sym} to ${PERSONA_LABEL[to]}`,
        'mint under issuer authority — supply delta is public',
        () => mintCft(s.acme!, address, s[to]!.tokenWallet, units),
      );
      if (ok === null) return;
      // Issuance lands as PENDING; the recipient's sweep makes it spendable.
      // A real, separate proved transaction — logged as exactly that.
      await run(
        `${PERSONA_LABEL[to]} swept pending funds to spendable`,
        'recipient sweep — required after receiving',
        () => sweepCft(s[to]!, address),
      );
    },
    [address, run, view],
  );

  const transfer = useCallback(
    async (from: 'alice' | 'bob', to: 'alice' | 'bob', units: bigint) => {
      const s = sessionsRef.current;
      if (!s[from] || !s[to] || !address) return;
      if (from === to) {
        setOpErr('Choose two different participants.');
        return;
      }
      const have = s[from]!.tokenWallet.spendable;
      if (units > have) {
        setOpErr(
          `Insufficient spendable balance — ${PERSONA_LABEL[from]} holds ${fmtUnits(have)} ${view?.symbol ?? ''}.`,
        );
        return;
      }
      const sym = view?.symbol ?? '';
      const ok = await run(
        `Transferred ${fmtUnits(units)} ${sym} — ${PERSONA_LABEL[from]} → ${PERSONA_LABEL[to]}`,
        'value hidden on the public ledger',
        () => transferCft(s[from]!, address, s[to]!.tokenWallet, units),
      );
      if (ok === null) return;
      await run(
        `${PERSONA_LABEL[to]} swept pending funds to spendable`,
        'recipient sweep — required after receiving',
        () => sweepCft(s[to]!, address),
      );
    },
    [address, run, view],
  );

  const redeem = useCallback(
    async (from: 'alice' | 'bob', units: bigint) => {
      const s = sessionsRef.current;
      if (!s[from] || !address) return;
      const have = s[from]!.tokenWallet.spendable;
      if (units > have) {
        setOpErr(
          `Insufficient spendable balance — ${PERSONA_LABEL[from]} holds ${fmtUnits(have)} ${view?.symbol ?? ''}.`,
        );
        return;
      }
      const sym = view?.symbol ?? '';
      await run(
        `Redeemed ${fmtUnits(units)} ${sym} from ${PERSONA_LABEL[from]}`,
        'burned against the issuer — supply delta is public',
        () => redeemCft(s[from]!, address, units),
      );
    },
    [address, run, view],
  );

  // Session-side issued/redeemed tallies derive from the activity we actually
  // performed (the chain publishes only the supply).
  useEffect(() => {
    let issued = 0n;
    let redeemed = 0n;
    for (const ev of activity) {
      const amount = ev.label.match(/^(Issued|Redeemed) ([\d,]+\.\d{2})/);
      if (!amount) continue;
      const units = BigInt(Math.round(parseFloat(amount[2]!.replace(/,/g, '')) * 100));
      if (amount[1] === 'Issued') issued += units;
      else redeemed += units;
    }
    setIssuedTotal(issued);
    setRedeemedTotal(redeemed);
  }, [activity]);

  const balances: Record<string, bigint> = {};
  for (const persona of ['alice', 'bob'] as const) {
    const s = sessions[persona];
    if (s) balances[persona] = s.tokenWallet.spendable + s.tokenWallet.pending;
  }

  const reset = useCallback(() => {
    sessionsRef.current = {};
    setSessions({});
    setAddress(null);
    setDeployTx(null);
    setView(null);
    setActivity([]);
    setDeploySteps(DEPLOY_STEPS.map((s) => ({ ...s, state: 'pending' as const })));
    setOpErr(null);
    setLastOp(null);
    setIssuedTotal(0n);
    setRedeemedTotal(0n);
  }, []);

  return {
    sessions,
    address,
    deployTx,
    view,
    activity,
    deploySteps,
    busy,
    opErr,
    lastOp,
    issuedTotal,
    redeemedTotal,
    balances,
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

export { hex, currentNetwork };
export type { CftSession, CftView };
