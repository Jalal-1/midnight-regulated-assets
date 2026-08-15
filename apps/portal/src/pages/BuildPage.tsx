/**
 * Build — the runbook, developer tools, and diagnostics. The counter lives
 * here now: it is the toolchain proof, not a headline example.
 */

import { useEffect } from 'react';

import { Link, SiteNav } from '@mra/lab-shell';

export default function BuildPage() {
  useEffect(() => {
    document.title = 'Build — Midnight regulated assets';
  }, []);

  return (
    <div className="portal-page">
      <SiteNav />
      <div className="portal-inner prose">
        <header className="portal-hero left">
          <span className="overline">Build</span>
          <h1>Run everything yourself</h1>
          <p className="home-sub">
            The repository is the product: read → run → fork. Everything below runs against the
            real stack; proving is local by default on every network.
          </p>
        </header>

        <h2>Prerequisites</h2>
        <ul>
          <li>Node 22+, Corepack enabled (<span className="mono">corepack enable</span>) — Yarn 4 is pinned</li>
          <li>Docker with compose (localnet runs node, indexer, and proof server)</li>
          <li>Linux or macOS; ~4 GB free for images and proving keys</li>
        </ul>

        <h2>First time</h2>
        <pre className="code-block">{`corepack enable
yarn install          # also applies the OpenZeppelin compatibility patch
yarn toolchain        # installs the pinned Compact compiler into .toolchain/
yarn redeploy         # compiles every contract (per-contract managed/ output)`}</pre>

        <h2>Every session</h2>
        <pre className="code-block">{`yarn localnet:up      # ALWAYS a fresh chain (state wiped by design)
yarn logs             # optional: dev log sidecar for the infra panels
yarn ui               # the portal → http://localhost:5173`}</pre>
        <p className="muted">
          <span className="mono">yarn localnet:resume</span> restarts the containers without
          wiping chain state. A wiped chain is detected honestly: instances from an earlier chain
          show as “previous chain”, never as live.
        </p>

        <h2>Lifecycle scripts (the Node references)</h2>
        <pre className="code-block">{`yarn workspace @mra/app-tokenised-deposit design-options:public
yarn workspace @mra/app-tokenised-deposit design-options:confidential
yarn counter:deploy   # the counter diagnostic`}</pre>
        <p>
          The browser labs mirror these scripts; when they disagree, the scripts are the
          reference.
        </p>

        <h2>Diagnostics</h2>
        <p>
          The <Link to="/build/counter" className="inline-link">counter console</Link> is the
          toolchain proof: compile → deploy → prove → submit → read back, with live
          infrastructure panels and per-operation timing breakdowns (proving is ~0.3 s; block
          inclusion is the rest). If the counter fails, debug nothing downstream of it.
        </p>

        <h2>Stagenet</h2>
        <p>
          The header pill on any console switches localnet ⇄ Stagenet (applied by reload — the
          SDK&apos;s network id is process-global). Stagenet needs faucet-funded seeds typed at
          runtime; seed entry is developer/test functionality, kept in memory only, never
          persisted, never bundled. Endpoints live in <span className="mono">packages/network</span>{' '}
          and nowhere else. Wallet connectivity is verified on Stagenet; the token lifecycles are
          not yet — they are labelled accordingly until actually run there.
        </p>

        <h2>Proving: local versus hosted</h2>
        <p>
          The proof server runs locally by default on every network, because witness data must
          not leave the machine. A hosted (TEE / confidential-space) prover can be configured via
          environment variables (<span className="mono">MRA_PROOF_SERVER_URL</span> + mandatory
          API key, HTTPS enforced) — a provision, not a default, and never wired into frontend
          bundles.
        </p>

        <h2>Version locks &amp; field notes</h2>
        <p>
          <span className="mono">ops/versions.lock.json</span> pins the stack that moves together;{' '}
          <span className="mono">docs/field-notes.md</span> records every non-obvious failure with
          its fix — currently the most useful file in the repository. See{' '}
          <Link to="/standards" className="inline-link">Standards &amp; assurance</Link> for the
          OpenZeppelin patch and compiler caveats.
        </p>

        <h2>Troubleshooting</h2>
        <ul>
          <li>
            <strong>Indexer 404s:</strong> the GraphQL path is version-scoped
            (<span className="mono">/api/v4/graphql</span>); a version mismatch fails opaquely.
          </li>
          <li>
            <strong>DustDoubleSpend on first deploy:</strong> a freshly started wallet may submit
            its own DUST registration; the apps wait one block after wallet start for exactly this
            reason.
          </li>
          <li>
            <strong>“Expected BN, actual …” in the browser:</strong> duplicated bn.js instances —
            the Vite config dedupes them; do not remove that block.
          </li>
          <li>
            <strong>Contracts showing “previous chain”:</strong> correct behaviour after{' '}
            <span className="mono">yarn localnet:up</span> — the chain is new; deploy again.
          </li>
        </ul>
      </div>
    </div>
  );
}
