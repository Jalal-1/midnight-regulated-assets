/**
 * The operation machinery every demo page shares: the timed activity log, the
 * step runner with Effect-aware error unwrapping, the phase tracker for proved
 * calls, and the timing bar that splits an operation's wall-clock into its
 * honest parts.
 *
 * Extracted from the counter page so the token pages get identical behaviour —
 * same log line shapes, same phases, same measured breakdowns — rather than
 * near-copies that drift.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { breakdownWindow, describeBreakdown, type ProvingBreakdown } from '@mra/network';

import { getProvingObserver } from './infra.ts';

export const OP_PHASES = ['proving', 'submitting', 'awaiting inclusion', 'reading back'] as const;

export interface Operation {
  readonly label: string;
  readonly phase: number;
  readonly startedAt: number;
  /** Proving-meter call count when the operation began, so the live timing bar
   *  and the final breakdown only see this operation's proofs. */
  readonly callsBefore: number;
}

export interface LogLine {
  readonly text: string;
  readonly kind: 'info' | 'ok' | 'error';
  readonly ms?: number;
}

export type Status = 'idle' | 'connecting' | 'ready' | 'working' | 'error';

/** Best-effort readable form for a non-Error thrown value. */
function describe(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    const json = JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    if (json && json !== '{}') return json.slice(0, 400);
  } catch {
    /* fall through */
  }
  return String(value);
}

/**
 * The timing bar: one operation's wall-clock, split into its honest parts.
 *
 * Proving is ~2% of the bar, and that is the entire message — the segment is
 * kept visible with a min-width, and the legend carries the exact numbers.
 * Segment identity is fixed order + label, never colour alone.
 */
export function TimingBar({ b, live }: { readonly b: ProvingBreakdown; readonly live: boolean }) {
  const total = Math.max(1, b.prepareMs + b.provingMs + b.inclusionMs);
  const width = (ms: number) => `${Math.max(0, (ms / total) * 100)}%`;
  const s = (ms: number, digits = 1) => `${(ms / 1000).toFixed(digits)}s`;
  const pending = live && b.provingCalls === 0;
  return (
    <div className="timing">
      <div
        className="timing-bar"
        role="img"
        aria-label={`prepare ${s(b.prepareMs)}, proving ${s(b.provingMs, 2)}, submit and inclusion ${s(b.inclusionMs)}`}
      >
        <span className="seg prepare" style={{ width: width(b.prepareMs) }} />
        {b.provingMs > 0 && <span className="seg proving" style={{ width: width(b.provingMs) }} />}
        {b.inclusionMs > 0 && (
          <span className="seg inclusion" style={{ width: width(b.inclusionMs) }} />
        )}
      </div>
      <div className="timing-legend">
        <span>
          <i className="chip prepare" />
          prepare {s(b.prepareMs)}
        </span>
        <span>
          <i className="chip proving" />
          proving {pending ? '…' : s(b.provingMs, 2)}
          {b.provingCalls > 1 ? ` (${b.provingCalls} calls)` : ''}
        </span>
        <span>
          <i className="chip inclusion" />
          submit + inclusion {pending ? '…' : s(b.inclusionMs)}
        </span>
      </div>
    </div>
  );
}

/** The operation bar: phase row, elapsed clock, live/last timing bar, caption. */
export function OpBar({
  op,
  lastTiming,
  now,
}: {
  readonly op: Operation | null;
  readonly lastTiming: { readonly label: string; readonly b: ProvingBreakdown } | null;
  readonly now: number;
}) {
  return (
    <section className="op-bar">
      <div className="op-head">
        <span className="label">Operation</span>
        <div className="phases">
          {OP_PHASES.map((label, i) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span
                className={
                  op && op.phase === i ? 'phase current' : op && op.phase > i ? 'phase done' : 'phase'
                }
              >
                {label}
              </span>
              {i < OP_PHASES.length - 1 && <span className="phase-arrow">→</span>}
            </div>
          ))}
        </div>
        <span className="op-elapsed">{op ? `${((now - op.startedAt) / 1000).toFixed(1)}s` : '—'}</span>
      </div>
      {(() => {
        if (op) {
          const b = breakdownWindow(getProvingObserver(), op.callsBefore, op.startedAt, now) ?? {
            prepareMs: now - op.startedAt,
            provingMs: 0,
            provingCalls: 0,
            inclusionMs: 0,
            totalMs: now - op.startedAt,
          };
          return <TimingBar b={b} live />;
        }
        return lastTiming ? <TimingBar b={lastTiming.b} live={false} /> : null;
      })()}
      <div className="op-caption">
        {op
          ? `${op.label} — ${OP_PHASES[op.phase]}`
          : lastTiming
            ? `idle — last ${lastTiming.label}: ${describeBreakdown(lastTiming.b)}`
            : 'idle — no operation in flight · a proved call takes ~18s: proving ~0.3s, block inclusion the rest'}
      </div>
    </section>
  );
}

/** The shared log/step/phase state for one demo page. */
export function useOps() {
  const [status, setStatus] = useState<Status>('idle');
  const [log, setLog] = useState<readonly LogLine[]>([]);
  const [op, setOp] = useState<Operation | null>(null);
  const [lastTiming, setLastTiming] = useState<{
    readonly label: string;
    readonly b: ProvingBreakdown;
  } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const logBox = useRef<HTMLDivElement>(null);

  // One clock for everything that shows elapsed time or ages.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const say = useCallback((text: string, kind: LogLine['kind'] = 'info', ms?: number) => {
    setLog((prev) => [...prev, { text, kind, ms }]);
  }, []);

  // Set scrollTop rather than scrollIntoView: on a fixed (overflow:hidden) page
  // scrollIntoView still scrolls ANCESTORS programmatically, which shoves the
  // header off-screen with no way for the user to scroll it back.
  useEffect(() => {
    const box = logBox.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [log]);

  /** Run a step, timing it and reporting failure rather than swallowing it. */
  const step = useCallback(
    async <T,>(label: string, fn: () => Promise<T>): Promise<T | undefined> => {
      const started = Date.now();
      say(`${label}…`);
      try {
        const result = await fn();
        say(label, 'ok', Date.now() - started);
        return result;
      } catch (error) {
        // Unwrap the cause chain. This stack wraps failures in terse messages
        // ("Transaction submission error") and buries the real reason in `cause`
        // — and that cause is often an Effect tagged error, NOT an Error, so an
        // `instanceof Error` walk stops before reaching anything useful.
        const parts: string[] = [];
        let current: unknown = error;
        for (let depth = 0; current != null && depth < 6; depth += 1) {
          const record = current as { message?: unknown; _tag?: unknown; cause?: unknown };
          const tag = typeof record._tag === 'string' ? `[${record._tag}] ` : '';
          const message =
            typeof record.message === 'string' && record.message
              ? record.message
              : describe(current);
          parts.push(`${tag}${message}`);
          current = record.cause;
        }
        if (parts.length === 0) parts.push(String(error));
        // Effect wraps failures in ways that hide the reason from both `message`
        // and `cause`. When the chain yields nothing useful, dump the error's own
        // properties so the real fault is visible instead of guessed at.
        if (parts.length < 2 && error != null) {
          // Effect rejects with a FiberFailure whose real Cause hangs off a
          // SYMBOL, invisible to both `cause` and getOwnPropertyNames.
          for (const symbol of Object.getOwnPropertySymbols(error)) {
            const value = (error as unknown as Record<symbol, unknown>)[symbol];
            parts.push(`${String(symbol)}: ${describe(value)}`);
          }
          for (const key of Object.getOwnPropertyNames(error)) {
            if (key === 'message' || key === 'stack') continue;
            parts.push(`${key}: ${describe((error as Record<string, unknown>)[key])}`);
          }
        }
        say(`${label} failed: ${parts.join('\n  ↳ ')}`, 'error');
        setStatus('error');
        return undefined;
      }
    },
    [say],
  );

  /**
   * Track a proved call's phases while `fn` runs.
   *
   * The proof server tells us nothing, so "proving" is observed from this page's
   * own POSTs to it (the shared fetch patch). Submission is too fast to observe,
   * so it gets a beat between proving ending and inclusion starting; everything
   * after that until `fn` resolves is the wait for a block.
   */
  const trackOp = useCallback(
    async <T,>(label: string, fn: () => Promise<T>): Promise<T | undefined> => {
      const observer = getProvingObserver();
      const startedAt = Date.now();
      const callsBefore = observer.calls().length;
      setOp({ label, phase: 0, startedAt, callsBefore });
      let provingSeen = false;
      const watcher = setInterval(() => {
        if (observer.proving()) {
          provingSeen = true;
        } else if (provingSeen) {
          clearInterval(watcher);
          setOp((current) => (current ? { ...current, phase: 1 } : current));
          setTimeout(() => setOp((current) => (current ? { ...current, phase: 2 } : current)), 600);
        }
      }, 250);
      try {
        const result = await fn();
        // The measured answer to "how long does proving take", from this
        // operation's actual requests to the prover — logged so it survives
        // in the record, not just in the bar.
        if (result !== undefined) {
          const b = breakdownWindow(observer, callsBefore, startedAt, Date.now());
          if (b) {
            setLastTiming({ label, b });
            say(`  ↳ ${describeBreakdown(b)}`);
          }
        }
        return result;
      } finally {
        clearInterval(watcher);
      }
    },
    [say],
  );

  /** Advance the op to its final phase (reading back). */
  const opReadingBack = useCallback(
    () => setOp((current) => (current ? { ...current, phase: 3 } : current)),
    [],
  );
  const endOp = useCallback(() => setOp(null), []);

  const busy = status === 'connecting' || status === 'working';

  return {
    status,
    setStatus,
    busy,
    log,
    say,
    step,
    op,
    trackOp,
    opReadingBack,
    endOp,
    lastTiming,
    now,
    logBox,
  };
}
