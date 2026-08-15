/**
 * Compare asset models — rendered entirely from the registry. The table
 * answers the standard question list for all five models; the cards below
 * carry the custody-mechanism claims with their evidence notes, kept distinct
 * per mechanism (HSM ≠ MPC ≠ multisig ≠ threshold policy).
 */

import { useEffect } from 'react';

import { ASSET_MODELS, type AssetModel } from '@mra/asset-models';
import { Link, SiteNav, StatusBadge } from '@mra/lab-shell';

const ROWS: readonly { label: string; value: (m: AssetModel) => string }[] = [
  { label: 'State model', value: (m) => m.stateModel },
  { label: 'Balances', value: (m) => m.visibility.balances },
  { label: 'Amounts', value: (m) => m.visibility.amounts },
  { label: 'Counterparties / graph', value: (m) => m.visibility.counterparties },
  { label: 'Supply', value: (m) => m.visibility.supply },
  { label: 'Issuer controls', value: (m) => m.issuerControls.join(' · ') },
  { label: 'What authorises movement', value: (m) => m.authorisationModel },
  { label: 'Sensitive material to protect', value: (m) => m.keyMaterial },
  { label: 'Proof-generation boundary', value: (m) => m.provingBoundary },
  { label: 'Regulator view', value: (m) => m.regulatoryDisclosure },
  { label: 'HSM', value: (m) => `${m.custody.hsm.status} — ${m.custody.hsm.note}` },
  { label: 'MPC / TSS', value: (m) => `${m.custody.mpc.status} — ${m.custody.mpc.note}` },
  { label: 'Multisig', value: (m) => `${m.custody.multisig.status} — ${m.custody.multisig.note}` },
  {
    label: 'Threshold policy (e.g. 2-of-3)',
    value: (m) => `${m.custody.thresholdPolicy.status} — ${m.custody.thresholdPolicy.note}`,
  },
  { label: 'Custody integration', value: (m) => `${m.custody.integration.status} — ${m.custody.integration.note}` },
  { label: 'Demonstrated today', value: (m) => m.verification },
  { label: 'Production readiness', value: (m) => m.readiness },
  { label: 'Standard / implementation', value: (m) => m.standards.implementation },
] as const;

export default function Compare() {
  useEffect(() => {
    document.title = 'Compare asset models — Midnight';
  }, []);

  return (
    <div className="portal-page">
      <SiteNav />
      <div className="portal-inner wide">
        <header className="portal-hero left">
          <span className="overline">Compare</span>
          <h1>Five ways to represent a regulated asset</h1>
          <p className="home-sub">
            Same questions, every model, answered from repository evidence. Two models run today
            as guided labs; the other three have honest status pages — nothing here is
            fabricated, and custody mechanisms are never treated as interchangeable.
          </p>
        </header>

        <div className="compare-wrap">
          <table className="compare-table">
            <thead>
              <tr>
                <th scope="col" className="sticky-col">
                  &nbsp;
                </th>
                {ASSET_MODELS.map((m) => (
                  <th scope="col" key={m.id}>
                    <Link to={m.route} className="compare-model-link">
                      {m.plainName}
                    </Link>
                    <div className="compare-badges">
                      <StatusBadge status={m.verification} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className="sticky-col">
                    {row.label}
                  </th>
                  {ASSET_MODELS.map((m) => (
                    <td key={m.id}>{row.value(m)}</td>
                  ))}
                </tr>
              ))}
              <tr>
                <th scope="row" className="sticky-col">
                  Try it
                </th>
                {ASSET_MODELS.map((m) => (
                  <td key={m.id}>
                    <Link to={m.route} className="inline-link">
                      {m.route.startsWith('/labs/') ? 'Open the lab →' : 'Status page →'}
                    </Link>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <section className="portal-section">
          <h2>Known limitations, per model</h2>
          <div className="model-cards">
            {ASSET_MODELS.map((m) => (
              <div key={m.id} className="model-card static">
                <div className="model-card-head">
                  <strong>{m.plainName}</strong>
                  <StatusBadge status={m.readiness} />
                </div>
                <ul className="limit-list">
                  {m.limitations.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
