/**
 * Try — implemented from the "Try" design artboard, wired to the REAL
 * pipeline. The artboard simulated a deploy with timers and a random address;
 * this page instead hands the chosen token + network to the studio (the
 * non-secret wizard config), which runs the actual deployment with its live
 * transaction steps. Nothing here is simulated.
 *
 * The note-based token cannot deploy (no contract module exists) — its card
 * says so and the deploy button disables, rather than pretending.
 */

import { useEffect, useState } from 'react';

import { Link, navigate } from '@mra/lab-shell';

import { DEFAULT_CONFIG, saveConfig, tokenDef, type StudioConfig, type TokenType } from '../studio/config.ts';
import { LpFooter, LpNav } from './lp.tsx';

const MODELS: readonly { id: TokenType; name: string; desc: string; deployable: boolean }[] = [
  { id: 'contract-unshielded', name: 'Public contract token', desc: 'Everything public — the transparency baseline.', deployable: true },
  { id: 'contract-confidential', name: 'Confidential contract token', desc: 'Encrypted balances, public supply.', deployable: true },
  { id: 'utxo-unshielded', name: 'Native public asset', desc: 'First-class ledger asset.', deployable: true },
  { id: 'zswap-shielded', name: 'Native private asset', desc: 'Bearer-style privacy.', deployable: true },
  { id: 'contract-note', name: 'Shielded contract token', desc: 'Fully graph-private — under development.', deployable: false },
];

const NETWORKS = [
  { id: 'local', name: 'Localnet', desc: 'Your machine — fresh chain, funded genesis seeds' },
  { id: 'stagenet', name: 'Stagenet', desc: 'Public test network — needs faucet funding' },
] as const;

export default function Try() {
  const [model, setModel] = useState<TokenType>('contract-confidential');
  const [network, setNetwork] = useState<'local' | 'stagenet'>('local');

  useEffect(() => {
    document.title = 'Try — deploy a token on Midnight';
  }, []);

  const selected = MODELS.find((m) => m.id === model)!;
  const netName = NETWORKS.find((n) => n.id === network)!.name;

  const deploy = () => {
    const def = tokenDef(model);
    const config: StudioConfig = {
      ...DEFAULT_CONFIG,
      token: model,
      network,
      assetName: def.defaults.name,
      symbol: def.defaults.symbol,
    };
    // Stage 6 = review & deploy: the studio resumes there with this config and
    // runs the real deployment (live steps, real transactions).
    saveConfig(config, 6);
    navigate('/studio');
  };

  return (
    <div className="lp-page">
      <LpNav active="/try" />
      <header className="lp-head">
        <div className="lp-overline">TRY</div>
        <h1>Deploy a token</h1>
        <p>
          Pick a model and a network. The lifecycle runs on the real node, wallet, proving and
          indexer stack — proving on your own machine. Prefer a guided walkthrough?{' '}
          <Link to="/learn">Open the labs</Link>.
        </p>
      </header>

      <section className="lp-wide try-sec">
        <div className="lp-overline">1 — CHOOSE A TOKEN</div>
        <div className="try-models">
          {MODELS.map((m) => (
            <button
              key={m.id}
              className={`try-card${model === m.id ? ' sel' : ''}${m.deployable ? '' : ' dev'}`}
              onClick={() => setModel(m.id)}
            >
              <strong>{m.name}</strong>
              <span>{m.desc}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="lp-wide try-sec">
        <div className="lp-overline">2 — CHOOSE A NETWORK</div>
        <div className="try-nets">
          {NETWORKS.map((n) => (
            <button
              key={n.id}
              className={`try-card${network === n.id ? ' sel' : ''}`}
              onClick={() => setNetwork(n.id)}
            >
              <strong>{n.name}</strong>
              <span>{n.desc}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="lp-wide try-go">
        {selected.deployable ? (
          <button className="lp-btn primary as-button" onClick={deploy}>
            Deploy {selected.name} to {netName} →
          </button>
        ) : (
          <div className="lp-note">
            {selected.name} is under development — no contract module exists to deploy. Every
            other model deploys through the dashboard.
          </div>
        )}
        <p className="lp-note try-note">
          Continues in the dashboard at the review step — the deployment itself runs there, with
          each transaction stage shown live.
        </p>
      </section>
      <LpFooter />
    </div>
  );
}
