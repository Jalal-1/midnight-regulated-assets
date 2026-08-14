/**
 * The homepage: where a new user picks the example they came for.
 *
 * Numbered cards in the site's 01… pattern. A card is a link only when the
 * thing behind it actually runs; planned work is shown disabled with its
 * milestone, not hidden and not oversold.
 *
 * The status strip at the bottom is REAL: it probes the node, indexer, and
 * proof server and reports what answered. The design mocked this as static
 * text — this repo does not mock chain state, so the dot means something.
 */

import { useEffect, useState } from 'react';

import { getNetwork } from '@mra/network';

import { getProvingObserver, probeAll, type InfraStatus } from './infra.ts';
import LogoMark from './Logo.tsx';
import { Link } from './router.tsx';

const POLL_MS = 5000;

function StatusStrip() {
  const [status, setStatus] = useState<InfraStatus | null>(null);
  useEffect(() => {
    let live = true;
    const tick = async () => {
      const next = await probeAll(getProvingObserver());
      if (live) setStatus(next);
    };
    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  const parts = [
    ['node :9944', status?.node.health],
    ['indexer :8088', status?.indexer.health],
    ['prover :6300', status?.proof.health],
  ] as const;
  const allUp = parts.every(([, h]) => h === 'up');
  const anyDown = parts.some(([, h]) => h === 'down');

  return (
    <span className="home-status">
      <span
        className={`home-status-dot ${allUp ? 'up' : anyDown ? 'down' : 'unknown'}`}
        aria-label={allUp ? 'all components up' : anyDown ? 'a component is down' : 'probing'}
      />
      {getNetwork().networkId === 'undeployed' ? 'localnet' : 'stagenet'}
      {parts.map(([label, health]) => (
        <span key={label} className={health === 'down' ? 'down' : undefined}>
          · {label}
          {health === 'down' ? ' DOWN' : health === undefined ? ' …' : ''}
        </span>
      ))}
    </span>
  );
}

interface CardProps {
  readonly n: string;
  readonly title: string;
  readonly badge: string;
  readonly badgeKind: 'live' | 'planned';
  readonly body: string;
  readonly to?: string;
}

function Card({ n, title, badge, badgeKind, body, to }: CardProps) {
  const inner = (
    <>
      {to && <span className="card-sweep" />}
      <span className="card-n">{n}</span>
      <span className="card-body">
        <span className="card-title-row">
          <strong>{title}</strong>
          <span className={`badge ${badgeKind === 'live' ? 'live' : 'other-chain'}`}>{badge}</span>
        </span>
        <span className="card-desc">{body}</span>
      </span>
      <span className={to ? 'card-arrow' : 'card-arrow muted'}>→</span>
    </>
  );
  return to ? (
    <Link to={to} className="home-card">
      {inner}
    </Link>
  ) : (
    <div className="home-card disabled" aria-disabled="true">
      {inner}
    </div>
  );
}

export default function Home() {
  useEffect(() => {
    document.title = 'Regulated assets on Midnight';
  }, []);

  return (
    <div className="home">
      <div className="home-glow" />
      <div className="home-inner">
        <header className="home-hero">
          <LogoMark className="home-logo" />
          <h1>Regulated assets on Midnight</h1>
          <p className="home-sub">
            Real financial products with programmable privacy, documented end to end. Everything
            runs on real networks — nothing is simulated. Pick an example to open its control
            surface.
          </p>
          <div className="home-divider" />
        </header>

        <section className="home-cards">
          <Card
            n="01"
            title="Counter — the toolchain proof"
            badge="live on localnet"
            badgeKind="live"
            to="/counter"
            body="Compile, deploy, prove, submit, read back. Wallets, contracts, and the full infrastructure panel — every value is live chain state."
          />
          <Card
            n="02"
            title="Unshielded contract token"
            badge="live on localnet"
            badgeKind="live"
            to="/unshielded-token"
            body="Tokenised-deposit design option 1: an owner-controlled, account-based token in public contract state — issue, transfer, redeem — and the reason it fails the checklist, demonstrated: anyone can enumerate every holder."
          />
          <Card
            n="03"
            title="RWA token"
            badge="planned — M5"
            badgeKind="planned"
            body="A money-market fund share with compliance built into the asset: allowlists, transfer restrictions, disclosure policy."
          />
        </section>

        <section className="home-links">
          <a
            href="https://github.com/Jalal-1/midnight-regulated-assets"
            target="_blank"
            rel="noreferrer"
          >
            Source & field notes →
          </a>
          <StatusStrip />
        </section>

        <footer className="home-footer">
          <p>
            Proofs are generated locally — witness data never leaves the machine. Local chains use
            well-known public test seeds, never funded keys.
          </p>
        </footer>
      </div>
    </div>
  );
}
