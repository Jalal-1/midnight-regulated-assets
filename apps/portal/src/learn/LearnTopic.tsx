/**
 * Learn — one chapter: article on the left, interactive model on the right.
 *
 * The models are ILLUSTRATIONS of the mechanics, labeled as such in the UI —
 * the hosted examples run the real thing. Chapter selection travels in the URL
 * hash (#ledger, #proving, #disclosure, #dust), so chapters are linkable and
 * the browser's back button walks the reading history.
 */

import { useCallback, useEffect, useState } from 'react';

import { Link } from '../router.tsx';
import { TOPICS, type Topic } from './topics.ts';

const hash8 = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

function LedgerModel() {
  const [kind, setKind] = useState<'shielded' | 'unshielded'>('shielded');
  const [shielded, setShielded] = useState<readonly string[]>([]);
  const [unshielded, setUnshielded] = useState<readonly string[]>([]);

  const submit = () => {
    if (kind === 'shielded') {
      setShielded((prev) => [...prev, `cm_${hash8()} · nullifier spent · amount hidden`].slice(-4));
    } else {
      const n = shielded.length + unshielded.length + 1;
      setUnshielded((prev) =>
        [...prev, `transfer #${n}: alice → bob · 1,000 tDEP · visible to all`].slice(-4),
      );
    }
  };

  return (
    <div className="model">
      <div className="model-controls">
        <button className={kind === 'shielded' ? 'persona active' : 'persona'} onClick={() => setKind('shielded')}>
          Shielded transfer
        </button>
        <button
          className={kind === 'unshielded' ? 'persona active' : 'persona'}
          onClick={() => setKind('unshielded')}
        >
          Unshielded transfer
        </button>
        <button className="model-primary" onClick={submit}>
          Submit transaction
        </button>
      </div>
      <div className="ledger-cols">
        <div className="ledger-col">
          <span className="overline accent">Shielded state</span>
          {shielded.length === 0 && <span className="muted small">No entries yet.</span>}
          {shielded.map((text, i) => (
            <div key={i} className="ledger-entry">
              {text}
            </div>
          ))}
        </div>
        <div className="ledger-col">
          <span className="overline">Unshielded state</span>
          {unshielded.length === 0 && <span className="muted small">No entries yet.</span>}
          {unshielded.map((text, i) => (
            <div key={i} className="ledger-entry">
              {text}
            </div>
          ))}
        </div>
      </div>
      <p className="model-caption">
        {kind === 'shielded'
          ? 'A shielded transfer records only a commitment and a spent nullifier — the amount and parties stay with their owners.'
          : 'An unshielded transfer is recorded in the clear — parties and amount readable by anyone, like a conventional chain.'}
      </p>
    </div>
  );
}

function ProvingModel() {
  const [phase, setPhase] = useState<'idle' | 'flying' | 'verified'>('idle');

  useEffect(() => {
    if (phase !== 'flying') return;
    const timer = setTimeout(() => setPhase('verified'), 1600);
    return () => clearTimeout(timer);
  }, [phase]);

  return (
    <div className="model">
      <div className="proving-stage">
        <div className="proving-box left">
          <div className="proving-node you">
            Your machine
            <br />
            <span className="muted small">witness data stays here</span>
          </div>
          <div className={`witness-chip${phase === 'flying' ? ' hot' : ''}`}>
            witness · amount · keys
          </div>
        </div>
        <div className="proving-node net">
          The network
          <br />
          <span className={phase === 'verified' ? 'verify ok' : 'verify muted'}>
            {phase === 'verified' ? 'proof verified ✓' : 'awaiting proof'}
          </span>
        </div>
        {phase === 'flying' && <div className="proof-pi">π proof</div>}
      </div>
      <div className="model-controls">
        <button className="model-primary" onClick={() => setPhase('flying')} disabled={phase === 'flying'}>
          Generate proof
        </button>
        <span className="muted small">
          {phase === 'flying'
            ? 'proving locally, sending only π…'
            : phase === 'verified'
              ? 'verified — witness never left the left box'
              : 'witness ready on your machine'}
        </span>
      </div>
      <p className="model-caption">
        Only the proof crosses the boundary. The witness — amounts, keys, identities — never
        leaves your machine.
      </p>
    </div>
  );
}

const ROLE_NAMES = ['Holder', 'Issuer', 'Regulator', 'Public'] as const;
const FIELD_DEFS = [
  { label: 'Sender', value: 'mn_shield-addr_test1…q3fx', vis: [true, true, true, false] },
  { label: 'Receiver', value: 'mn_shield-addr_test1…88hz', vis: [true, true, true, false] },
  { label: 'Amount', value: '1,000 tDEP', vis: [true, true, true, false] },
  { label: 'Compliance check', value: 'allowlist passed · rule KYC-2', vis: [false, true, true, false] },
  { label: 'Validity', value: 'proof verified ✓', vis: [true, true, true, true] },
] as const;
const ROLE_CAPTIONS = [
  'The holder sees their own transfer in full, but not issuer-side compliance detail.',
  'The issuer sees what it must administer — parties, amount, and the compliance result.',
  'The regulator sees what policy grants: the full record, on demand, without a master key.',
  'The public sees only that a valid transaction occurred. Nothing else leaks.',
] as const;

function DisclosureModel() {
  const [role, setRole] = useState(0);
  return (
    <div className="model">
      <div className="model-controls">
        {ROLE_NAMES.map((name, i) => (
          <button key={name} className={i === role ? 'persona active' : 'persona'} onClick={() => setRole(i)}>
            {name}
          </button>
        ))}
      </div>
      <div className="disclosure-card">
        <span className="overline">Transfer record — as seen by {ROLE_NAMES[role]}</span>
        {FIELD_DEFS.map((field) => (
          <div key={field.label} className="disclosure-row">
            <span className="muted">{field.label}</span>
            <span className={field.vis[role] ? 'mono clear' : 'mono masked'}>
              {field.vis[role] ? field.value : 'hidden'}
            </span>
          </div>
        ))}
      </div>
      <p className="model-caption">{ROLE_CAPTIONS[role]}</p>
    </div>
  );
}

function DustModel() {
  const [night, setNight] = useState(25_000);
  const rate = Math.round(night * 0.24);
  const motes = Math.min(8, Math.ceil(night / 12_500));
  return (
    <div className="model">
      <div className="dust-slider">
        <div className="dust-slider-head">
          <span>NIGHT held</span>
          <span className="mono">{night.toLocaleString('en-US')}</span>
        </div>
        <input
          type="range"
          min={0}
          max={100_000}
          step={1000}
          value={night}
          onChange={(e) => setNight(Number(e.target.value))}
        />
      </div>
      <div className="dust-stage">
        <div className="dust-side">
          NIGHT
          <br />
          <span className="mono big">{night.toLocaleString('en-US')}</span>
        </div>
        <div className="dust-motes">
          {Array.from({ length: motes }, (_, i) => (
            <span
              key={i}
              className="dust-mote"
              style={{
                left: 8 + (i % 4) * 14,
                animationDuration: `${1.8 + (i % 3) * 0.5}s`,
                animationDelay: `${i * 0.35}s`,
              }}
            />
          ))}
        </div>
        <div className="dust-side">
          DUST capacity
          <br />
          <span className="mono big accent">{rate.toLocaleString('en-US')} / day</span>
        </div>
      </div>
      <p className="model-caption">
        Illustrative rate. DUST accrues continuously toward a capacity proportional to NIGHT held,
        and is spent per transaction — never transferred, never traded.
      </p>
    </div>
  );
}

const MODELS: Record<Topic['id'], () => React.JSX.Element> = {
  ledger: LedgerModel,
  proving: ProvingModel,
  disclosure: DisclosureModel,
  dust: DustModel,
};

export default function LearnTopic() {
  const topicFromHash = useCallback(() => {
    const id = location.hash.replace('#', '');
    const idx = TOPICS.findIndex((t) => t.id === id);
    return idx >= 0 ? idx : 0;
  }, []);
  const [idx, setIdx] = useState(topicFromHash);

  useEffect(() => {
    const onHash = () => setIdx(topicFromHash());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, [topicFromHash]);

  const topic = TOPICS[idx]!;

  useEffect(() => {
    document.title = `${topic.title} — Learn`;
  }, [topic.title]);

  const go = (next: number) => {
    const target = TOPICS[next];
    if (!target) return;
    location.hash = target.id;
  };

  const Model = MODELS[topic.id];

  return (
    <div className="topic">
      <header className="topic-head">
        <Link to="/learn" className="muted-link">
          ← Contents
        </Link>
        <span className="muted small">0{idx + 1} / 04</span>
        <span className="topic-title">{topic.title}</span>
        <div className="topic-nav">
          <button className="theme-btn" onClick={() => go(idx - 1)} disabled={idx === 0}>
            ← Prev
          </button>
          <button className="theme-btn" onClick={() => go(idx + 1)} disabled={idx === TOPICS.length - 1}>
            Next →
          </button>
          <Link to="/examples" className="muted-link">
            Try it live →
          </Link>
        </div>
      </header>

      <div className="topic-body">
        <article className="topic-article">
          <span className="overline">Chapter 0{idx + 1}</span>
          <h1>{topic.title}</h1>
          {topic.paragraphs.map((text, i) => (
            <p key={i} className="topic-para">
              {text}
            </p>
          ))}
          <div className="terms">
            <span className="overline">Key terms</span>
            {topic.terms.map((term) => (
              <div key={term.name} className="term-row">
                <strong>{term.name}</strong>
                <span>{term.def}</span>
              </div>
            ))}
          </div>
          {idx < TOPICS.length - 1 ? (
            <button className="next-chapter" onClick={() => go(idx + 1)}>
              <span className="next-label">
                <span className="overline">Next chapter</span>
                <span className="next-title">{TOPICS[idx + 1]!.title}</span>
              </span>
              <span className="card-arrow">→</span>
            </button>
          ) : (
            <Link to="/examples" className="next-chapter finale">
              <span className="next-label">
                <span className="overline light">That&apos;s the architecture</span>
                <span className="next-title">Now see it running — the hosted examples</span>
              </span>
              <span className="card-arrow light">→</span>
            </Link>
          )}
        </article>

        <section className="topic-model">
          <div className="model-head">
            <span className="overline">Interactive model</span>
            <span className="muted small">{topic.hint}</span>
          </div>
          <Model />
        </section>
      </div>
    </div>
  );
}
