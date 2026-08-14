/**
 * Live status of the three components behind the app.
 *
 * What each one is willing to tell you differs a lot, and that shapes this file:
 *
 *   node     rich. JSON-RPC gives health, version, best/finalized height, and
 *            the mempool — so you can watch a transaction wait for inclusion.
 *   indexer  rich. GraphQL gives its own indexed height, which compared against
 *            the node's is the lag that explains "why hasn't my state updated".
 *   proof    almost nothing. /version, /health, /ready — and no /metrics at all.
 *            Its real behaviour only shows up in its log, hence the sidecar.
 *
 * Status is polled rather than subscribed. Blocks are ~6 s apart, so a 2 s poll is
 * effectively live for a fraction of the code a ws subscription would need. The
 * node and indexer both support subscriptions if that ever stops being true.
 */

import { getNetwork, meterProving, type ProvingMeter } from '@mra/network';

export type { ProvingMeter };

export type Health = 'up' | 'down' | 'unknown';

export interface NodeStatus {
  health: Health;
  version?: string;
  chain?: string;
  best?: number;
  finalized?: number;
  peers?: number;
  syncing?: boolean;
  /** Transactions accepted but not yet in a block. */
  pending?: number;
}

export interface IndexerStatus {
  health: Health;
  indexed?: number;
  /** Blocks behind the node. Positive means catching up. */
  lag?: number;
}

export interface ProofServerStatus {
  health: Health;
  version?: string;
  url: string;
  /** True while the page has a proving request in flight. */
  proving: boolean;
  /** Duration of the last completed proof, ms. */
  lastProofMs?: number;
}

export interface InfraStatus {
  node: NodeStatus;
  indexer: IndexerStatus;
  proof: ProofServerStatus;
}

const rpc = async (url: string, method: string): Promise<unknown> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [] }),
  });
  if (!response.ok) throw new Error(`${method}: ${response.status}`);
  return (await response.json()).result;
};

async function probeNode(): Promise<NodeStatus> {
  const { node } = getNetwork();
  try {
    const [health, version, chain, header, pending] = await Promise.all([
      rpc(node, 'system_health') as Promise<{ peers: number; isSyncing: boolean }>,
      rpc(node, 'system_version') as Promise<string>,
      rpc(node, 'system_chain') as Promise<string>,
      rpc(node, 'chain_getHeader') as Promise<{ number: string }>,
      rpc(node, 'author_pendingExtrinsics') as Promise<unknown[]>,
    ]);
    // Header numbers are hex strings.
    const best = Number.parseInt(header.number, 16);
    return {
      health: 'up',
      version,
      chain,
      best,
      peers: health.peers,
      syncing: health.isSyncing,
      pending: pending.length,
    };
  } catch {
    return { health: 'down' };
  }
}

/** Finalized height needs a second hop: hash, then header. Kept separate so a
 *  failure here does not blank out the rest of the node's status. */
async function probeFinalized(): Promise<number | undefined> {
  const { node } = getNetwork();
  try {
    const hash = (await rpc(node, 'chain_getFinalizedHead')) as string;
    const response = await fetch(node, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'chain_getHeader', params: [hash] }),
    });
    const { result } = await response.json();
    return Number.parseInt(result.number, 16);
  } catch {
    return undefined;
  }
}

async function probeIndexer(nodeBest?: number): Promise<IndexerStatus> {
  const { indexer } = getNetwork();
  try {
    const response = await fetch(indexer, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ block { height } }' }),
    });
    if (!response.ok) return { health: 'down' };
    const body = await response.json();
    const indexed = body?.data?.block?.height as number | undefined;
    return {
      health: 'up',
      indexed,
      lag: nodeBest !== undefined && indexed !== undefined ? nodeBest - indexed : undefined,
    };
  } catch {
    return { health: 'down' };
  }
}

async function probeProofServer(): Promise<Omit<ProofServerStatus, 'proving' | 'lastProofMs'>> {
  const { proofServer } = getNetwork();
  try {
    const response = await fetch(`${proofServer}/version`);
    if (!response.ok) return { health: 'down', url: proofServer };
    return { health: 'up', version: (await response.text()).trim(), url: proofServer };
  } catch {
    return { health: 'down', url: proofServer };
  }
}

/**
 * The one shared proving meter (from @mra/network — the Node reference script
 * uses the same instrument, so the numbers are comparable). The infrastructure
 * panel, the operation phase tracker, and the timing breakdown all read this,
 * and `meterProving` patches `fetch` — creating it twice would double-count
 * every request.
 */
let sharedObserver: ProvingMeter | undefined;
export function getProvingObserver(): ProvingMeter {
  sharedObserver ??= meterProving(getNetwork().proofServer);
  return sharedObserver;
}

/** One full sweep of all three components. */
export async function probeAll(observer?: ProvingMeter): Promise<InfraStatus> {
  const node = await probeNode();
  const [finalized, indexer, proof] = await Promise.all([
    probeFinalized(),
    probeIndexer(node.best),
    probeProofServer(),
  ]);
  return {
    node: { ...node, finalized },
    indexer,
    proof: {
      ...proof,
      proving: observer?.proving() ?? false,
      lastProofMs: observer?.lastProofMs(),
    },
  };
}

// --- Log stream (dev-only sidecar) -----------------------------------------

export interface LogLine {
  readonly source: string;
  readonly text: string;
  readonly at: number;
}

/**
 * Same-origin path, proxied by Vite to the sidecar on 127.0.0.1:8899.
 *
 * Deliberately not the sidecar's URL directly: Firefox refuses an EventSource
 * from localhost:5173 to 127.0.0.1:8899 even with correct CORS headers. See the
 * proxy in vite.config.ts.
 */
export const LOG_SIDECAR_URL = '/__logs';

/**
 * Subscribe to container logs from the dev sidecar (`yarn logs`).
 *
 * Absent by design in any deployed build: it tails Docker on the developer's
 * machine. `onState` reports whether it is connected so the UI can say so rather
 * than look broken.
 */
export function streamLogs(
  onLine: (line: LogLine) => void,
  onState: (connected: boolean) => void,
): () => void {
  let source: EventSource | undefined;
  try {
    source = new EventSource(LOG_SIDECAR_URL);
  } catch {
    onState(false);
    return () => {};
  }

  source.addEventListener('open', () => onState(true));
  source.addEventListener('line', (event) => {
    try {
      const { source: from, text } = JSON.parse((event as MessageEvent).data);
      onLine({ source: from, text, at: Date.now() });
    } catch {
      /* ignore malformed frames */
    }
  });
  // EventSource retries on its own; report the gap without tearing down.
  source.addEventListener('error', () => onState(false));

  return () => source?.close();
}
