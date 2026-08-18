/** Privacy-profile exposure chart — shared by the live dashboard and read views. */

import type { TokenKind } from './useStudioChain.ts';

// ---- Privacy profile chart (visibility tab) -----------------------------------------
// Exposure level per fact, 0 = everyone … 3 = no one. One row per fact; the
// dot's position IS the privacy level. Levels and sentences mirror the ledger
// behaviour of the deployed model — nothing aspirational.
const EXPOSURE_LEVELS = ['Everyone', 'Transaction parties', 'Holder only', 'No one'] as const;
interface ExposureRow {
  readonly fact: string;
  readonly level: 0 | 1 | 2 | 3;
  /** Public on purpose — supply-style facts kept visible so issuance is attestable. */
  readonly onPurpose?: boolean;
  readonly detail: string;
}

function exposureProfile(kind: TokenKind): readonly ExposureRow[] {
  switch (kind) {
    case 'utxo':
    case 'public':
      return [
        { fact: 'Balances', level: 0, detail: 'Anyone can read every balance from public state.' },
        { fact: 'Transfer amounts', level: 0, detail: 'Every amount is public the moment it confirms.' },
        { fact: 'Counterparties', level: 0, detail: 'Sender and recipient are visible on every transfer.' },
        { fact: 'Supply', level: 0, onPurpose: true, detail: 'Total supply is public contract state.' },
      ];
    case 'zswap':
      return [
        { fact: 'Balances', level: 2, detail: 'Each holder decrypts only their own coins; the chain stores commitments.' },
        { fact: 'Transfer amounts', level: 1, detail: 'Sender and recipient know the amount; the public ledger hides it.' },
        { fact: 'Counterparties', level: 1, detail: 'Only the transacting parties know each other; the ledger links nothing.' },
        { fact: 'Supply', level: 0, onPurpose: true, detail: 'Cumulative issuance is public contract state, so issuance stays attestable.' },
      ];
    default:
      return [
        { fact: 'Balances', level: 2, detail: 'Balances are ciphertexts; each holder proves and reads only their own.' },
        { fact: 'Transfer amounts', level: 1, detail: 'Transfer values are hidden on-chain; the parties know them, and supply deltas expose mint/redeem amounts.' },
        { fact: 'Counterparties', level: 0, detail: 'Stable account identifiers are public on every transfer in this model.' },
        { fact: 'Supply', level: 0, onPurpose: true, detail: 'Total supply and each issue/redeem delta are public, so backing can be reconciled.' },
      ];
  }
}

export default function ExposureChart({ kind }: { readonly kind: TokenKind }) {
  return (
    <div className="st-expochart">
      <div className="st-expo-axis">
        <span className="st-expo-gutter" />
        {EXPOSURE_LEVELS.map((l) => <span key={l}>{l}</span>)}
      </div>
      {exposureProfile(kind).map((r) => (
        <div key={r.fact} className="st-expo-row" title={r.detail}>
          <span className="st-expo-fact">{r.fact}</span>
          <span className="st-expo-track">
            <span className="st-expo-line" />
            {EXPOSURE_LEVELS.map((l, i) => <i key={l} className="st-expo-tick" style={{ left: `${(i * 100) / 3}%` }} />)}
            <span className={`st-expo-dot lv${r.level}${r.onPurpose ? ' purpose' : ''}`} style={{ left: `${(r.level * 100) / 3}%` }} />
          </span>
          <span className="st-expo-val">
            {EXPOSURE_LEVELS[r.level]}
            {r.onPurpose && <em> · on purpose</em>}
          </span>
        </div>
      ))}
      <div className="st-legend st-expo-legend">
        <span><i className="st-expo-dot lv0 inline" />public</span>
        <span><i className="st-expo-dot lv1 inline" />parties only</span>
        <span><i className="st-expo-dot lv2 inline" />holder only</span>
        <span className="st-tickmuted">hover a row for exactly who sees what</span>
      </div>
    </div>
  );
}
