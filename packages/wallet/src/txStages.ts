/**
 * Live transaction-stage events.
 *
 * The provider adapters emit a line at each REAL boundary of a transaction's
 * life — construction is implicit (it ends when proving starts), then proving,
 * balancing, finalising, submission, and the wait for block inclusion. Nothing
 * here is simulated or timed by guesswork: every line is emitted by the code
 * actually doing that work, with measured durations.
 *
 * UIs subscribe to narrate long-running calls; with no subscribers the events
 * cost nothing.
 */

type Listener = (message: string) => void;

const listeners = new Set<Listener>();

/** Subscribe to stage lines. Returns the unsubscribe function. */
export function onTxStage(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitTxStage(message: string): void {
  for (const listener of listeners) listener(message);
}
