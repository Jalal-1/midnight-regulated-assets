/**
 * Deployed-contract history: pick one to interact with, or deploy another.
 *
 * Entries the current chain cannot serve are shown but disabled, with the reason.
 * Hiding them would be tidier and worse — after a localnet reset the honest
 * message is "these belonged to the previous chain", not an empty list that looks
 * like the app forgot.
 */

import type { CheckedContract, ContractState } from './history.ts';

const STATE_LABEL: Record<ContractState, string> = {
  live: 'live',
  'not-found': 'no state',
  'other-chain': 'previous chain',
};

const short = (address: string) => `${address.slice(0, 8)}…${address.slice(-6)}`;

const when = (at: number) => {
  const seconds = Math.round((Date.now() - at) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86_400)}d ago`;
};

interface Props {
  readonly contracts: readonly CheckedContract[];
  readonly active: string | null;
  readonly busy: boolean;
  readonly onSelect: (address: string) => void;
  readonly onForget: (address: string) => void;
  readonly onRefresh: () => void;
}

export default function Contracts({
  contracts,
  active,
  busy,
  onSelect,
  onForget,
  onRefresh,
}: Props) {
  const stale = contracts.filter((c) => c.state !== 'live').length;

  return (
    <section className="contracts">
      <div className="contracts-head">
        <h2>Contracts</h2>
        <span className="muted small">
          {contracts.length === 0
            ? 'none yet'
            : `${contracts.length - stale} live${stale > 0 ? ` · ${stale} stale` : ''}`}
        </span>
        <button className="link" onClick={onRefresh} disabled={busy} title="Re-check the chain">
          refresh
        </button>
      </div>

      {contracts.length === 0 ? (
        <p className="muted small contracts-empty">
          Deploy a counter and it will be remembered here, so you can come back to it.
        </p>
      ) : (
        <ul className="contract-list">
          {contracts.map((contract) => {
            const isActive = contract.address === active;
            // Selectable whenever the contract is on the CURRENT chain, even if
            // its state did not read. A failed read can just be indexer lag, and
            // refusing to select would strand a working contract with no way back.
            // Only 'other-chain' is genuinely unusable.
            const selectable = contract.state !== 'other-chain' && !busy && !isActive;
            return (
              <li key={contract.address} className={isActive ? 'active' : undefined}>
                <button
                  className="contract-row"
                  onClick={() => onSelect(contract.address)}
                  disabled={!selectable}
                  title={contract.address}
                >
                  <span className="mono">{short(contract.address)}</span>
                  <span className={`badge ${contract.state}`}>{STATE_LABEL[contract.state]}</span>
                  <span className="muted small round">
                    {contract.round !== undefined ? `round ${contract.round}` : '—'}
                  </span>
                  <span className="muted small">{when(contract.deployedAt)}</span>
                </button>
                <button
                  className="link forget"
                  onClick={() => onForget(contract.address)}
                  disabled={busy}
                  title="Remove from this list (does not affect the chain)"
                  aria-label={`Forget ${contract.address}`}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {stale > 0 && (
        <p className="note">
          Stale entries are kept deliberately: a localnet restart creates a new chain, so contracts
          from an earlier run still exist in this browser but not on the chain.
        </p>
      )}
    </section>
  );
}
