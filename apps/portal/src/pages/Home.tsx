/**
 * The homepage — implemented from the "Landing Page" Claude Design artboard
 * (project de355b9b, 2026-08-18), with the design's copy corrected against the
 * repository where they disagreed:
 *
 *  - Both native models have WORKING EXAMPLES (studio lifecycles, e2e-verified)
 *    — the design showed them as in-development.
 *  - The native private asset's issuance counter is PUBLIC in this wrapper —
 *    the design showed supply hidden.
 *  - The footer states the configured proving boundary, not "witness never
 *    leaves the machine".
 *  - The six-dimensions subtitle does not claim registry-scored evidence.
 *
 * The design's own prototype banner row is omitted: the global EvidenceBanner
 * already renders above every page.
 */

import { useEffect } from 'react';

import { currentNetworkName, Link, LogoMark } from '@mra/lab-shell';

const PUB = { className: 'lp-chip pub' };
const HID = { className: 'lp-chip hid' };

const facts = (b: boolean, a: boolean, p: boolean, s: boolean) => [
  { label: 'Balances', ...(b ? PUB : HID) },
  { label: 'Amounts', ...(a ? PUB : HID) },
  { label: 'Parties', ...(p ? PUB : HID) },
  { label: 'Supply', ...(s ? PUB : HID) },
];

const MODELS = [
  {
    name: 'Native public asset',
    status: 'Working example',
    dot: 'ok',
    facts: facts(true, true, true, true),
    cta: 'View details',
    href: '/models/native-unshielded',
  },
  {
    name: 'Public contract token',
    status: 'Live lab',
    dot: 'ok',
    facts: facts(true, true, true, true),
    cta: 'Open the lab',
    href: '/labs/public-token',
  },
  {
    name: 'Confidential contract token',
    status: 'Live lab',
    dot: 'ok',
    facts: facts(false, false, true, true),
    cta: 'Open the lab',
    href: '/labs/confidential-token',
  },
  {
    name: 'Native private asset',
    status: 'Working example',
    dot: 'ok',
    // Supply: this wrapper's cumulative issuance counter is public.
    facts: facts(false, false, false, true),
    cta: 'View details',
    href: '/models/native-shielded',
  },
  {
    name: 'Shielded contract token',
    status: 'Under development',
    dot: 'dev',
    facts: facts(false, false, false, false),
    cta: 'View details',
    href: '/models/shielded-contract-token',
  },
] as const;

const DIMENSIONS = [
  { name: 'Privacy', body: 'Who sees balances, amounts and counterparties.' },
  { name: 'Issuer control', body: 'What the issuer keeps after an asset leaves its hands.' },
  { name: 'Custody fit', body: 'A key an HSM can hold, or witness material that can’t.' },
  { name: 'Regulatory disclosure', body: 'Whether a supervisor can see more than the public.' },
  { name: 'Interoperability', body: 'What settles and composes on shared public rails.' },
  { name: 'Production readiness', body: 'What has a working example, on which network — stated exactly.' },
] as const;

export default function Home() {
  useEffect(() => {
    document.title = 'Regulated assets on Midnight';
  }, []);
  const stagenet = currentNetworkName() === 'stagenet';

  return (
    <div className="lp-page">
      <nav className="lp-nav">
        <span className="lp-brand">
          <LogoMark className="lp-logo" />
          Regulated assets on Midnight
        </span>
        <span className="lp-links">
          <Link to="/why">Why Midnight</Link>
          <Link to="/compare">Compare</Link>
          <Link to="/solutions">Use Cases</Link>
          <Link to="/learn">Try</Link>
          <Link to="/studio">Dashboard</Link>
        </span>
        <span className={`lp-netpill${stagenet ? '' : ' local'}`}>
          {stagenet ? 'STAGENET' : 'LOCAL'}
        </span>
      </nav>

      <header className="lp-hero">
        <div className="lp-glow" />
        <div className="lp-hero-inner">
          <h1>Regulated assets on Midnight</h1>
          <p>
            Choose the right balance of privacy, control and disclosure for each financial
            instrument — on public blockchain infrastructure.
          </p>
          <div className="lp-ctas">
            <Link to="/compare" className="lp-btn primary">Compare asset models</Link>
            <Link to="/learn" className="lp-btn outline">Try it</Link>
          </div>
        </div>
      </header>

      <section className="lp-section">
        <div className="lp-section-head">
          <h2>Five models, one spectrum</h2>
          <span className="lp-legend">
            <span><i className="lp-chip pub" />public</span>
            <span><i className="lp-chip hid" />hidden</span>
            <span><i className="lp-dot ok" />working example</span>
            <span><i className="lp-dot dev" />under development</span>
          </span>
        </div>
        <div className="lp-spectrum" />
        <div className="lp-spectrum-ends"><span>FULLY PUBLIC</span><span>FULLY PRIVATE</span></div>
        <div className="lp-models">
          {MODELS.map((m) => (
            <Link key={m.name} to={m.href} className="lp-model">
              <span className="lp-status"><i className={`lp-dot ${m.dot}`} />{m.status}</span>
              <strong>{m.name}</strong>
              <span className="lp-facts">
                {m.facts.map((f) => (
                  <span key={f.label}><i className={f.className} />{f.label}</span>
                ))}
              </span>
              <span className="lp-cta">{m.cta} →</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="lp-section">
        <h2>Six dimensions, stated plainly</h2>
        <p className="lp-sub">The same questions answered on every model page — from what runs in this repository.</p>
        <div className="lp-dims">
          {DIMENSIONS.map((d) => (
            <div key={d.name} className="lp-dim">
              <strong>{d.name}</strong>
              <span>{d.body}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-custody">
          <div className="lp-custody-text">
            <h2>Designed around institutional custody</h2>
            <p>
              Every model page states its authorisation mechanism precisely — a conventional
              signing key, or witness material that changes what a custodian must protect. No
              model here is described as custodian-validated.
            </p>
          </div>
          <div className="lp-custody-tags">
            <span>HSM</span><span>MPC</span><span>Multisig</span><span>2-of-3 policies</span>
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <p>
          Every example runs on the real Midnight node, wallet, proving and indexer stack.
          Proving runs on your own machine by default — witness-bearing inputs stay within that
          configured local boundary.
        </p>
      </footer>
    </div>
  );
}
