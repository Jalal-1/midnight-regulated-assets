/**
 * The homepage: an institutional introduction, not a developer console.
 *
 * Structure per the portal brief: headline + core proposition, primary CTA to
 * the model comparison, secondary CTA to Learn & Try, the six decision
 * dimensions, the custody message, and evidence-led model cards driven by the
 * asset-model registry (statuses are the registry's, never restated).
 */

import { useEffect } from 'react';

import { ASSET_MODELS } from '@mra/asset-models';
import { Link, LogoMark, SiteNav, StatusBadge } from '@mra/lab-shell';

const DIMENSIONS = [
  {
    name: 'Privacy',
    body: 'What balances, amounts, and counterparties are visible — to whom, and enforced by what.',
  },
  {
    name: 'Issuer control',
    body: 'Mint, burn, and the compliance operations an issuer retains after an asset leaves its hands.',
  },
  {
    name: 'Institutional custody fit',
    body: 'Whether authorisation is a conventional signature an HSM/MPC/multisig stack can hold, or witness material that needs new treatment.',
  },
  {
    name: 'Regulatory disclosure',
    body: 'Whether a supervisor can receive a differentiated view — and whether that mechanism actually exists yet.',
  },
  {
    name: 'Public interoperability',
    body: 'What settles on shared public infrastructure and composes with the rest of the chain.',
  },
  {
    name: 'Production readiness',
    body: 'What is demonstrated, on which network, on what dependency maturity — stated exactly.',
  },
] as const;

export default function Home() {
  useEffect(() => {
    document.title = 'Regulated assets on Midnight';
  }, []);

  return (
    <div className="portal-page">
      <SiteNav />
      <div className="home-glow" />
      <div className="portal-inner">
        <header className="portal-hero">
          <LogoMark className="landing-logo" />
          <h1>Regulated assets on Midnight</h1>
          <p className="portal-lede">
            Choose the right balance of privacy, control and disclosure for each financial
            instrument — on public blockchain infrastructure.
          </p>
          <p className="home-sub">
            Midnight allows an issuer to choose how an asset is represented, what information is
            public or private, what controls the issuer retains, how custody and authorisation
            work, and who can access regulated disclosures — all while operating on public
            blockchain infrastructure.
          </p>
          <div className="cta-row">
            <Link to="/compare" className="cta primary">
              Compare asset models
            </Link>
            <Link to="/learn" className="cta secondary">
              Learn &amp; Try
            </Link>
          </div>
        </header>

        <section className="portal-section">
          <h2>Six decisions, one framework</h2>
          <p className="home-sub">
            Every asset model here is scored against the same dimensions, from evidence in this
            repository — not aspiration.
          </p>
          <div className="dim-grid">
            {DIMENSIONS.map((d) => (
              <div key={d.name} className="dim-card">
                <strong>{d.name}</strong>
                <span>{d.body}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="portal-section">
          <h2>Built for institutional security architectures</h2>
          <p className="home-sub">
            Designed around the security controls institutions already use — from HSM-backed key
            management and MPC to multisig and 2-of-3 approval policies. These products have been
            shaped through extensive technical feedback from custodians. Privacy is only
            institutionally useful when it can coexist with custody, approval, recovery and
            governance controls — which is why every model page states its authorisation
            mechanism and custody status precisely, and never treats HSM, MPC, multisig and
            threshold policies as interchangeable.
          </p>
        </section>

        <section className="portal-section">
          <h2>The asset models</h2>
          <div className="model-cards">
            {ASSET_MODELS.map((m) => (
              <Link key={m.id} to={m.route} className="model-card">
                <div className="model-card-head">
                  <strong>{m.plainName}</strong>
                  <StatusBadge status={m.verification} />
                </div>
                <span className="card-desc">{m.summary}</span>
                <span className="landing-cta">
                  {m.route.startsWith('/labs/') ? 'Open the lab →' : 'Read the status →'}
                </span>
              </Link>
            ))}
          </div>
        </section>

        <footer className="portal-footer">
          <LogoMark className="brand-logo" />
          <p>
            Every interactive example uses the real Midnight node, wallet, proving and indexer
            stack. Each example states whether it has been verified on localnet or Stagenet.
            Proofs are generated locally — witness data never leaves the machine.
          </p>
        </footer>
      </div>
    </div>
  );
}
