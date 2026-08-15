/**
 * The guided-walkthrough frame every lab shares. A lab page provides:
 * numbered narrative sections (asset & use case, participants, disclosure
 * profile, custody & authorisation), the live console, and the closing
 * sections (what stayed public/private, production considerations, source).
 *
 * Labs are scrolling documents — the console section keeps its own internal
 * scroll areas, but the page reads top-to-bottom like a walkthrough.
 */

import type { ReactNode } from 'react';

import type { AssetModel } from '@mra/asset-models';

import SiteNav from './SiteNav.tsx';
import StatusBadge from './StatusBadge.tsx';

export function LabSection({
  n,
  title,
  children,
}: {
  readonly n: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="lab-section">
      <div className="lab-section-head">
        <span className="card-n">{n}</span>
        <h2>{title}</h2>
      </div>
      <div className="lab-section-body">{children}</div>
    </section>
  );
}

export default function LabLayout({
  model,
  chainId,
  children,
}: {
  readonly model: AssetModel;
  readonly chainId?: string | null;
  readonly children: ReactNode;
}) {
  return (
    <div className="lab-page">
      <SiteNav chainId={chainId ?? null} />
      <div className="lab-inner">
        <header className="lab-head">
          <span className="overline">Learn &amp; Try · guided walkthrough</span>
          <h1>{model.canonicalName}</h1>
          <p className="home-sub">{model.summary}</p>
          <div className="lab-badges">
            <StatusBadge status={model.verification} />
            <StatusBadge status={model.readiness} />
          </div>
          <p className="muted small">
            Every interactive example uses the real Midnight node, wallet, proving and indexer
            stack. This example has been {model.verification.toLowerCase()}.
          </p>
        </header>
        {children}
      </div>
    </div>
  );
}
