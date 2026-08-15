/**
 * Learn — the contents page. Four chapters in the site's numbered-list
 * pattern; each opens the topic page at its chapter anchor.
 */

import { useEffect } from 'react';

import LogoMark from '../Logo.tsx';
import { Link } from '../router.tsx';
import { TOPICS } from './topics.ts';

export default function Learn() {
  useEffect(() => {
    document.title = 'Learn — token architecture on Midnight';
  }, []);

  return (
    <div className="learn">
      <div className="home-glow" />
      <div className="learn-inner">
        <header className="learn-head">
          <div className="learn-nav">
            <Link to="/" className="muted-link">
              ← Home
            </Link>
            <Link to="/examples" className="muted-link right">
              Try the examples →
            </Link>
          </div>
          <LogoMark className="learn-logo" />
          <span className="overline">Learn</span>
          <h1>Token architecture on Midnight</h1>
          <p className="home-sub">
            How regulated assets are built here. Each chapter pairs a short explanation with an
            interactive model you can operate yourself.
          </p>
          <span className="muted small">
            4 chapters · about ten minutes · read in order or jump in anywhere
          </span>
          <div className="home-divider" />
        </header>

        <section className="learn-list">
          {TOPICS.map((topic, i) => (
            <Link key={topic.id} to={`/learn/topic#${topic.id}`} className="learn-row">
              <span className="card-n">0{i + 1}</span>
              <strong>{topic.title}</strong>
              <span className="card-desc">{topic.summary}</span>
              <span className="card-arrow">→</span>
            </Link>
          ))}
        </section>

        <footer>
          <p className="muted small">
            Interactive models are illustrations of the mechanics — the{' '}
            <Link to="/examples" className="inline-link">
              hosted examples
            </Link>{' '}
            run the real thing.
          </p>
        </footer>
      </div>
    </div>
  );
}
