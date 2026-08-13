/**
 * Live view of the three components behind the app.
 *
 * The point is to make the stack legible: which pieces exist, whether they are
 * healthy, how far behind the indexer is, and what the proof server is doing
 * while you wait ~18 s for a transaction.
 */

import { useEffect, useRef, useState } from 'react';

import {
  observeProving,
  probeAll,
  streamLogs,
  type InfraStatus,
  type LogLine,
  type ProvingObserver,
} from './infra.ts';

const POLL_MS = 2000;
const MAX_LOG_LINES = 200;

function Dot({ health }: { health: 'up' | 'down' | 'unknown' }) {
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

export default function Infrastructure() {
  const [status, setStatus] = useState<InfraStatus | null>(null);
  const [logs, setLogs] = useState<readonly LogLine[]>([]);
  const [logsConnected, setLogsConnected] = useState(false);
  const [showLogs, setShowLogs] = useState(true);
  const observer = useRef<ProvingObserver | null>(null);
  const logEnd = useRef<HTMLDivElement>(null);

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
    return streamLogs(
      (line) => setLogs((prev) => [...prev, line].slice(-MAX_LOG_LINES)),
      setLogsConnected,
    );
  }, []);

  useEffect(() => {
    if (showLogs) logEnd.current?.scrollIntoView({ block: 'nearest' });
  }, [logs, showLogs]);

  const node = status?.node;
  const indexer = status?.indexer;
  const proof = status?.proof;

  return (
    <section className="infra">
      <h2>Infrastructure</h2>

      <div className="infra-grid">
        <div className="panel">
          <div className="panel-head">
            <Dot health={node?.health ?? 'unknown'} />
            <strong>Node</strong>
            <span className="muted small">{node?.version ?? '—'}</span>
          </div>
          <Row label="chain" value={node?.chain ?? '—'} />
          <Row label="best" value={node?.best !== undefined ? `#${node.best}` : '—'} />
          <Row
            label="finalized"
            value={node?.finalized !== undefined ? `#${node.finalized}` : '—'}
          />
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
          <Row label="reads" value="contract state, events" />
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
          {/* Two things worth saying out loud: this panel is thinner than the
              others because the proof server exposes no metrics, not because we
              skipped it; and proving is NOT what makes a transaction slow here. */}
          <p className="note">
            No metrics endpoint — observed from this page&apos;s own requests. Note that proving
            takes well under a second: the ~18&nbsp;s per transaction is almost all waiting for
            block inclusion, not proof generation.
          </p>
        </div>
      </div>

      <div className="logs-head">
        <button className="link" onClick={() => setShowLogs((v) => !v)}>
          {showLogs ? '▾' : '▸'} Container logs
        </button>
        <span className="muted small">
          {logsConnected ? `${logs.length} lines` : 'sidecar not running — `yarn logs`'}
        </span>
      </div>

      {showLogs && (
        <div className="logs">
          {logs.length === 0 && (
            <p className="muted">
              {logsConnected ? 'waiting for output…' : 'Start the sidecar with `yarn logs`.'}
            </p>
          )}
          {logs.map((line, i) => (
            <p key={i}>
              <span className={`src ${line.source}`}>{line.source.padEnd(7)}</span>
              <span className="txt">{line.text}</span>
            </p>
          ))}
          <div ref={logEnd} />
        </div>
      )}
    </section>
  );
}
