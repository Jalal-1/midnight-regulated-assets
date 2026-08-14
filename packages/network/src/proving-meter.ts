/**
 * Measures what the proof server is actually asked to do.
 *
 * The proof server exposes no metrics endpoint, so the only source of truth for
 * "how long did proving take" is the requests this process sends it. The meter
 * patches `fetch` once and records every POST to the proof server — proving is
 * POST; the health polls are GET and must not count, or they show up as 0 ms
 * "proofs" every poll interval.
 *
 * Used by both ends of the repo on purpose: the browser UI and the Node
 * reference script (apps/counter/src/deploy.ts) report the same breakdown from
 * the same instrument, so their numbers are comparable.
 */

/** One completed round-trip to the prover. Duration includes transport, which
 *  against localhost is negligible next to the proof itself. */
export interface ProofCall {
  readonly startedAt: number;
  readonly ms: number;
}

export interface ProvingMeter {
  /** True while at least one proving request is in flight. */
  proving(): boolean;
  /** Duration of the most recently completed proving call. */
  lastProofMs(): number | undefined;
  /** Completed proving calls, oldest first. */
  calls(): readonly ProofCall[];
}

/** Bounded so a long-lived page cannot grow it forever. */
const MAX_CALLS = 200;

export function meterProving(proofServerUrl: string): ProvingMeter {
  let inFlight = 0;
  const completed: ProofCall[] = [];

  const original = globalThis.fetch;
  globalThis.fetch = async (...args: Parameters<typeof fetch>) => {
    const url = typeof args[0] === 'string' ? args[0] : String((args[0] as Request).url ?? args[0]);
    const method = (args[1]?.method ?? (args[0] as Request)?.method ?? 'GET').toUpperCase();
    if (!url.startsWith(proofServerUrl) || method !== 'POST') return original(...args);

    inFlight += 1;
    const startedAt = Date.now();
    try {
      return await original(...args);
    } finally {
      inFlight -= 1;
      completed.push({ startedAt, ms: Date.now() - startedAt });
      if (completed.length > MAX_CALLS) completed.shift();
    }
  };

  return {
    proving: () => inFlight > 0,
    lastProofMs: () => completed.at(-1)?.ms,
    calls: () => completed,
  };
}

/**
 * Split one operation's wall-clock time into its honest parts.
 *
 * Given the window [startedAt, endedAt] of a proved call and the prover calls
 * observed inside it:
 *
 *   prepare    from start until the first proving request leaves — building and
 *              balancing the transaction, loading keys
 *   proving    time spent inside requests to the prover
 *   inclusion  from the last proof coming back until the call resolves — submit
 *              plus waiting for the block (the dominant term on a ~6 s chain)
 */
export interface ProvingBreakdown {
  readonly prepareMs: number;
  readonly provingMs: number;
  readonly provingCalls: number;
  readonly inclusionMs: number;
  readonly totalMs: number;
}

export function breakdownWindow(
  meter: ProvingMeter,
  callsBefore: number,
  startedAt: number,
  endedAt: number,
): ProvingBreakdown | null {
  const calls = meter.calls().slice(callsBefore);
  if (calls.length === 0) return null;
  const first = calls[0]!;
  const last = calls.at(-1)!;
  const provingMs = calls.reduce((sum, call) => sum + call.ms, 0);
  return {
    prepareMs: Math.max(0, first.startedAt - startedAt),
    provingMs,
    provingCalls: calls.length,
    inclusionMs: Math.max(0, endedAt - (last.startedAt + last.ms)),
    totalMs: endedAt - startedAt,
  };
}

/** One-line rendering used by both the UI log and the Node script. */
export function describeBreakdown(b: ProvingBreakdown): string {
  const s = (ms: number, digits = 1) => `${(ms / 1000).toFixed(digits)}s`;
  const calls = b.provingCalls > 1 ? ` (${b.provingCalls} calls)` : '';
  return (
    `prepare ${s(b.prepareMs)} · proving ${s(b.provingMs, 2)}${calls} · ` +
    `submit + inclusion ${s(b.inclusionMs)}`
  );
}
