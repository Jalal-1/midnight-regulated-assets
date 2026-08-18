/**
 * Learn & Try — the section index. Guided application walkthroughs first
 * (that is the point of the section); honest status pages for models without
 * lifecycles; the architecture concepts as supporting reading.
 */

import { useEffect } from 'react';

import { labModels, statusPageModels } from '@mra/asset-models';
import { Link, LogoMark, StatusBadge } from '@mra/lab-shell';

import { LpNav } from '../pages/lp.tsx';

import { TOPICS } from './topics.ts';

export default function Learn() {
  useEffect(() => {
    document.title = 'Learn & Try — Midnight regulated assets';
  }, []);

  return (
    <div className="portal-page">
      <LpNav active="/try" />
      <div className="home-glow" />
      <div className="portal-inner">
        <header className="portal-hero left">
          <LogoMark className="learn-logo" />
          <span className="overline">Learn &amp; Try</span>
          <h1>Guided walkthroughs on the real stack</h1>
          <p className="home-sub">
            Every lab drives real wallets, real contracts, and real proofs, and walks the same
            cast — ACME Bank issues, Alice and Bob transact, Eve observes — through issue
            1,000.00, transfer 250.00, redeem 500.00. Each states exactly what stayed public and
            what stayed private.
          </p>
        </header>

        <section className="portal-section">
          <h2>The labs</h2>
          <div className="model-cards">
            {labModels().map((m) => (
              <Link key={m.id} to={m.route} className="model-card">
                <div className="model-card-head">
                  <strong>{m.plainName}</strong>
                  <StatusBadge status={m.verification} />
                </div>
                <span className="card-desc">{m.summary}</span>
                <span className="landing-cta">Open the lab →</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="portal-section">
          <h2>Models without a lifecycle yet</h2>
          <p className="muted small">
            Honest status pages — intended properties and real gaps, no fake buttons.
          </p>
          <div className="model-cards">
            {statusPageModels().map((m) => (
              <Link key={m.id} to={m.route} className="model-card">
                <div className="model-card-head">
                  <strong>{m.plainName}</strong>
                  <StatusBadge status={m.verification} />
                </div>
                <span className="card-desc">{m.summary}</span>
                <span className="landing-cta">Read the status →</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="portal-section">
          <h2>The architecture, in four chapters</h2>
          <p className="muted small">
            Supporting reading with interactive teaching models — illustrations of the mechanics;
            the labs above run the real thing.
          </p>
          <div className="learn-list">
            {TOPICS.map((topic, i) => (
              <Link key={topic.id} to={`/learn/topic#${topic.id}`} className="learn-row">
                <span className="card-n">0{i + 1}</span>
                <strong>{topic.title}</strong>
                <span className="card-desc">{topic.summary}</span>
                <span className="card-arrow">→</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
