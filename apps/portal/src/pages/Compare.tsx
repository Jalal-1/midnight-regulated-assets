/**
 * Compare — implemented from the "Compare" design artboard: eight glyph-coded
 * rows instead of prose, one column per model. The artboard's data was synced
 * from a stale registry; every cell below is corrected against what the
 * repository actually runs:
 *
 *  - Both native models have working examples (studio lifecycles,
 *    e2e-verified), not "in development".
 *  - Native private supply: this wrapper's cumulative issuance counter is
 *    public (the artboard said "not attestable").
 *  - Custody fit for the native public asset is "closer to conventional
 *    signing — unvalidated", not "designed for compatibility".
 */

import { useEffect } from 'react';

import { Link } from '@mra/lab-shell';

import { LpFooter, LpNav } from './lp.tsx';

type Cell = {
  readonly text: string;
  readonly chip?: 'pub' | 'hid' | 'warn';
  readonly tone?: 'dim' | 'bright' | 'ok' | 'warn' | 'gray';
};

const P = (text: string): Cell => ({ text, chip: 'pub', tone: 'bright' });
const H = (text: string): Cell => ({ text, chip: 'hid', tone: 'bright' });
const W = (text: string): Cell => ({ text, chip: 'warn', tone: 'warn' });
const T = (text: string, tone: Cell['tone']): Cell => ({ text, tone });

const MODELS = [
  { name: 'Public contract token', status: 'Live lab', dot: 'ok', cta: 'Open the lab', href: '/labs/public-token' },
  { name: 'Confidential contract token', status: 'Live lab', dot: 'ok', cta: 'Open the lab', href: '/labs/confidential-token' },
  { name: 'Native public asset', status: 'Working example', dot: 'ok', cta: 'View details', href: '/models/native-unshielded' },
  { name: 'Native private asset', status: 'Working example', dot: 'ok', cta: 'View details', href: '/models/native-shielded' },
  { name: 'Shielded contract token', status: 'Under development', dot: 'dev', cta: 'View details', href: '/models/shielded-contract-token' },
] as const;

const ROWS: readonly { label: string; cells: readonly Cell[] }[] = [
  { label: 'Balances', cells: [P('Public'), H('Encrypted'), P('Public'), H('Hidden'), H('Hidden')] },
  { label: 'Amounts', cells: [P('Public'), H('Hidden'), P('Public'), H('Hidden'), H('Hidden')] },
  { label: 'Counterparties', cells: [P('Public'), P('Public'), P('Public'), H('Hidden'), H('Hidden')] },
  {
    label: 'Supply',
    cells: [P('Public'), P('Public — deltas visible'), P('Public'), P('Issuance public (cumulative)'), W('Under development')],
  },
  {
    label: 'Issuer control',
    cells: [
      T('Mint + owner burn', 'bright'),
      T('Mint + holder redemption', 'bright'),
      T('None after mint', 'dim'),
      T('None after mint', 'dim'),
      T('Under development (draft)', 'gray'),
    ],
  },
  {
    label: 'Authorisation',
    cells: [
      T('Proofs — witness secret', 'dim'),
      T('Proofs — witness secret', 'dim'),
      T('Signatures — signing key', 'bright'),
      T('Proofs — note secrets', 'dim'),
      T('Proofs — note secrets', 'dim'),
    ],
  },
  {
    label: 'Custody fit',
    cells: [
      T('Requires adaptation', 'warn'),
      T('Requires adaptation', 'warn'),
      T('Closer to conventional signing — unvalidated', 'warn'),
      T('Note secrets — open problem', 'warn'),
      T('Not integrated', 'gray'),
    ],
  },
  {
    label: 'Regulator view',
    cells: [
      T('Same as public', 'dim'),
      T('Not implemented', 'gray'),
      T('Same as public', 'dim'),
      T('Not implemented', 'gray'),
      T('Not implemented', 'gray'),
    ],
  },
];

export default function Compare() {
  useEffect(() => {
    document.title = 'Compare asset models — Midnight';
  }, []);

  return (
    <div className="lp-page">
      <LpNav active="/compare" />
      <header className="lp-head">
        <div className="lp-overline">COMPARE</div>
        <h1>Five ways to represent a regulated asset</h1>
        <p>
          Same questions, every model — answered from repository evidence. Full detail lives on
          each model&apos;s page.
        </p>
      </header>

      <section className="lp-wide">
        <div className="cmp2">
          <div className="cmp2-row cmp2-head">
            <div className="cmp2-label" />
            {MODELS.map((m) => (
              <div key={m.name} className="cmp2-model">
                <strong>{m.name}</strong>
                <span className="lp-status"><i className={`lp-dot ${m.dot}`} />{m.status}</span>
              </div>
            ))}
          </div>
          {ROWS.map((row) => (
            <div key={row.label} className="cmp2-row">
              <div className="cmp2-label">{row.label}</div>
              {row.cells.map((c, i) => (
                <div key={MODELS[i]!.name} className="cmp2-cell">
                  {c.chip && <i className={`lp-chip ${c.chip}`} />}
                  <span className={`cmp2-t ${c.tone ?? 'bright'}`}>{c.text}</span>
                </div>
              ))}
            </div>
          ))}
          <div className="cmp2-row">
            <div className="cmp2-label" />
            {MODELS.map((m) => (
              <div key={m.name} className="cmp2-cell">
                <Link to={m.href}>{m.cta} →</Link>
              </div>
            ))}
          </div>
        </div>
        <div className="lp-legend cmp2-legend">
          <span><i className="lp-chip pub" />public</span>
          <span><i className="lp-chip hid" />hidden / encrypted</span>
          <span><i className="lp-chip warn" />caveat</span>
        </div>
        <p className="lp-note">
          No model is production-ready, and no applicable audit exists for the pinned modules.
          Every status above traces to code, tests or field notes in the repository — known
          limitations are listed on each model&apos;s page.
        </p>
      </section>
      <LpFooter />
    </div>
  );
}
