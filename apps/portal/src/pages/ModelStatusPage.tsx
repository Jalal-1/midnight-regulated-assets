/**
 * The honest status page for asset models that do not have a working lifecycle
 * in this repository. No buttons, no transactions, no simulated chain state —
 * intended properties, missing capabilities, and pointers to source.
 */

import { useEffect } from 'react';

import { getModel } from '@mra/asset-models';
import { Link, SiteNav, StatusBadge, VisibilityMatrix } from '@mra/lab-shell';

export default function ModelStatusPage({ id }: { readonly id: string }) {
  const model = getModel(id);

  useEffect(() => {
    document.title = model ? `${model.plainName} — status` : 'Model status';
  }, [model]);

  if (!model) {
    return (
      <div className="portal-page">
        <SiteNav />
        <div className="portal-inner prose">
          <h1>Unknown model</h1>
          <p>
            <Link to="/compare" className="inline-link">Back to the comparison →</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="portal-page">
      <SiteNav />
      <div className="portal-inner prose">
        <header className="portal-hero left">
          <span className="overline">Learn &amp; Try · status page</span>
          <h1>{model.canonicalName}</h1>
          <p className="home-sub">{model.summary}</p>
          <div className="lab-badges">
            <StatusBadge status={model.verification} />
            <StatusBadge status={model.readiness} />
          </div>
          <p className="note">
            There is no working lifecycle for this model in this repository, so this page has no
            buttons and simulates nothing. What follows is the model&apos;s intended properties
            and its honestly-stated gaps.
          </p>
        </header>

        <h2>Intended disclosure profile</h2>
        <ul>
          <li><strong>Balances:</strong> {model.visibility.balances}</li>
          <li><strong>Amounts:</strong> {model.visibility.amounts}</li>
          <li><strong>Counterparties:</strong> {model.visibility.counterparties}</li>
          <li><strong>Supply:</strong> {model.visibility.supply}</li>
        </ul>
        <VisibilityMatrix model={model} />

        <h2>Authorisation &amp; custody</h2>
        <p>{model.authorisationModel}</p>
        <p>
          <strong>Sensitive material:</strong> {model.keyMaterial}
        </p>
        <ul>
          <li>
            HSM: <StatusBadge status={model.custody.hsm.status} /> — {model.custody.hsm.note}
          </li>
          <li>
            MPC: <StatusBadge status={model.custody.mpc.status} /> — {model.custody.mpc.note}
          </li>
          <li>
            Multisig: <StatusBadge status={model.custody.multisig.status} /> —{' '}
            {model.custody.multisig.note}
          </li>
          <li>
            Threshold policy: <StatusBadge status={model.custody.thresholdPolicy.status} /> —{' '}
            {model.custody.thresholdPolicy.note}
          </li>
        </ul>

        <h2>What is missing</h2>
        <ul>
          {model.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>

        <h2>Standards</h2>
        <p>{model.standards.implementation}</p>
        <p className="muted">{model.standards.auditStatus}</p>

        <h2>Source &amp; notes</h2>
        <ul>
          {model.source.map((s) => (
            <li key={s} className="mono small">
              {s}
            </li>
          ))}
        </ul>
        <p>
          <Link to="/compare" className="inline-link">Back to the comparison →</Link>
        </p>
      </div>
    </div>
  );
}
