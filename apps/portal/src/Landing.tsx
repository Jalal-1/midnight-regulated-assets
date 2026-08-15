/**
 * The front door. Two paths: Learn (the architecture, with interactive models)
 * or Try (the live examples index). Fixed viewport, per the design.
 */

import { useEffect } from 'react';

import LogoMark from './Logo.tsx';
import { Link } from './router.tsx';

export default function Landing() {
  useEffect(() => {
    document.title = 'Regulated assets on Midnight';
  }, []);

  return (
    <div className="landing">
      <div className="home-glow landing-glow" />
      <main className="landing-main">
        <LogoMark className="landing-logo" />
        <div className="landing-hero">
          <span className="overline">Regulated assets on Midnight</span>
          <h1>Real financial products. Programmable privacy.</h1>
          <p className="home-sub">
            Zero-knowledge proofs protect what must stay private; selective disclosure reveals what
            must not. Everything here runs against real networks — nothing is simulated.
          </p>
        </div>
        <div className="home-divider landing-divider" />
        <div className="landing-cards">
          <Link to="/learn" className="landing-card go-learn">
            <span className="overline">Learn</span>
            <strong>Token architecture on Midnight</strong>
            <span className="card-desc">
              How tokens are built here — the dual-state ledger, local proving, selective
              disclosure, and compliance as a property of the asset.
            </span>
            <span className="landing-cta">Explore the architecture&nbsp;→</span>
          </Link>
          <Link to="/examples" className="landing-card go-try">
            <span className="overline">Try</span>
            <strong>Hosted examples, live</strong>
            <span className="card-desc">
              Open the console against a real network — wallets, contracts, and infrastructure,
              all live chain state.
            </span>
            <span className="landing-cta">Browse the examples&nbsp;→</span>
          </Link>
        </div>
      </main>
      <footer className="landing-footer">
        <LogoMark className="brand-logo" />
        <p>Proofs are generated locally — witness data never leaves the machine.</p>
        <a
          href="https://github.com/Jalal-1/midnight-regulated-assets"
          target="_blank"
          rel="noreferrer"
        >
          Source &amp; field notes
        </a>
      </footer>
    </div>
  );
}
