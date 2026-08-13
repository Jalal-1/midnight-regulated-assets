/**
 * Live view of the three components behind the app.
 *
 * The point is to make the stack legible: which pieces exist, whether they are
 * healthy, how far behind the indexer is, and what the proof server is doing
 * while you wait ~18 s for a transaction.
 *
 * Each component owns its own log drawer, fed by the dev sidecar. Logs are
 * per-component rather than one merged stream because the interesting question is
 * always about one piece — "what is the prover doing", not "what is everything
 * doing at once".
 */

import { useEffect, useRef, useState } from 'react';

import {
  observeProving,
  probeAll,
  streamLogs,
  type Health,
  type InfraStatus,
  type LogLine,
  type ProvingObserver,
} from './infra.ts';

const POLL_MS = 2000;
/** Per source, so one chatty component cannot evict another's history. */
const MAX_LINES_PER_SOURCE = 150;

function Dot({ health }: { health: Health }) {
  return <span className={`dot ${health}`} aria-label={health} />;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="row">
      <span className="k">{label}</span>
      <span className="v">{value}</span>
    </div>
  );
}

/** Collapsible log tail for one component. */
function LogDrawer({
  source,
  lines,
  connected,
}: {
  source: string;
  lines: readonly LogLine[];
  connected: boolean;
}) {
  const [open, setOpen] = useState(false);
  const body = useRef<HTMLDivElement>(null);

  // scrollTop, not scrollIntoView — see the note in App.tsx.
  useEffect(() => {
    const box = body.current;
    if (open && box) box.scrollTop = box.scrollHeight;
  }, [lines, open]);

  return (
    <div className="drawer">
      <button className="drawer-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="caret">{open ? '▾' : '▸'}</span> logs
        <span className="drawer-count">
          {connected ? lines.length : 'sidecar off'}
        </span>
      </button>
      {open && (
        <div className={`drawer-body ${source}`} ref={body}>
          {lines.length === 0 ? (
            <p className="muted">{connected ? 'waiting for output…' : 'run `yarn logs`'}</p>
          ) : (
            lines.map((line, i) => <p key={i}>{line.text}</p>)
          )}
        </div>
      )}
    </div>
  );
}

export default function Infrastructure() {
  const [status, setStatus] = useState<InfraStatus | null>(null);
  // Grouped by source rather than one flat list: each drawer wants only its own
  // lines, and trimming per source stops a chatty component evicting another's.
  const [logs, setLogs] = useState<Record<string, readonly LogLine[]>>({});
  const [logsConnected, setLogsConnected] = useState(false);
  const observer = useRef<ProvingObserver | null>(null);

  // Patch fetch once, before any proving happens.
  if (observer.current === null) observer.current = observeProving();

  useEffect(() => {
    let live = true;
    const tick = async () => {
      const next = await probeAll(observer.current ?? undefined);
      if (live) setStatus(next);
    };
    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    return streamLogs((line) => {
      setLogs((prev) => ({
        ...prev,
        [line.source]: [...(prev[line.source] ?? []), line].slice(-MAX_LINES_PER_SOURCE),
      }));
    }, setLogsConnected);
  }, []);

  const { node, indexer, proof } = status ?? {};

  return (
    <section className="infra">
      <div className="infra-head">
        <h2>Infrastructure</h2>
        <span className="muted small">
          {logsConnected ? 'logs streaming' : 'logs off — `yarn logs`'}
        </span>
      </div>

      <div className="infra-grid">
        <div className="panel">
          <div className="panel-head">
            <Dot health={node?.health ?? 'unknown'} />
            <strong>Node</strong>
            <span className="muted small">{node?.version ?? '—'}</span>
          </div>
          <Row label="chain" value={node?.chain ?? '—'} />
          <Row label="best" value={node?.best !== undefined ? `#${node.best}` : '—'} />
          <Row label="finalized" value={node?.finalized !== undefined ? `#${node.finalized}` : '—'} />
          <Row label="peers" value={node?.peers ?? '—'} />
          <Row
            label="mempool"
            value={
              node?.pending === undefined ? (
                '—'
              ) : node.pending > 0 ? (
                <span className="busy">{node.pending} pending</span>
              ) : (
                'empty'
              )
            }
          />
          <LogDrawer source="node" lines={logs.node ?? []} connected={logsConnected} />
        </div>

        <div className="panel">
          <div className="panel-head">
            <Dot health={indexer?.health ?? 'unknown'} />
            <strong>Indexer</strong>
            <span className="muted small">api v4</span>
          </div>
          <Row label="indexed" value={indexer?.indexed !== undefined ? `#${indexer.indexed}` : '—'} />
          <Row
            label="lag"
            value={
              indexer?.lag === undefined ? (
                '—'
              ) : indexer.lag <= 1 ? (
                'in step'
              ) : (
                <span className="busy">{indexer.lag} blocks behind</span>
              )
            }
          />
          <Row label="reads" value="state, events" />
          <LogDrawer source="indexer" lines={logs.indexer ?? []} connected={logsConnected} />
        </div>

        <div className="panel">
          <div className="panel-head">
            <Dot health={proof?.health ?? 'unknown'} />
            <strong>Proof server</strong>
            <span className="muted small">{proof?.version ?? '—'}</span>
          </div>
          <Row label="url" value={<span className="mono small">{proof?.url ?? '—'}</span>} />
          <Row
            label="state"
            value={proof?.proving ? <span className="busy">proving…</span> : 'idle'}
          />
          <Row
            label="last /prove"
            value={
              proof?.lastProofMs !== undefined ? `${(proof.lastProofMs / 1000).toFixed(2)}s` : '—'
            }
          />
          {/* Proving is NOT what makes a transaction slow here, and the panel
              should not let anyone assume otherwise. */}
          <p className="note">
            No metrics endpoint — observed from this page. Proving is sub-second; the ~18&nbsp;s per
            transaction is block inclusion.
          </p>
          <LogDrawer source="proof" lines={logs.proof ?? []} connected={logsConnected} />
        </div>
      </div>
    </section>
  );
}
