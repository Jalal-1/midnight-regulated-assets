/**
 * Solution: RWA tokens (working example: a money-market fund share).
 * Everything on this page is design intent unless explicitly marked otherwise
 * — the RWA app is not built yet, and the page says so up front.
 */

import { useEffect } from 'react';

import { Link, StatusBadge } from '@mra/lab-shell';

import { LpNav } from './lp.tsx';

const CAPABILITIES = [
  {
    name: 'Confidential balances & amounts',
    status: 'Working example — localnet',
    note: 'Inherited from the confidential contract token the composition starts from.',
  },
  {
    name: 'Controlled issuance & redemption',
    status: 'Working example — localnet',
    note: 'Owner-gated mint and burn, demonstrated in the deposit labs.',
  },
  {
    name: 'Allowlists / investor eligibility',
    status: 'Not implemented',
    note: 'No allowlist module is composed in this repo yet.',
  },
  {
    name: 'Transfer restrictions',
    status: 'Not implemented',
    note: 'The CFT returns caller ids specifically so a wrapper can gate transfers; no wrapper exists yet.',
  },
  {
    name: 'Pause / freeze controls',
    status: 'Not implemented',
    note: 'No pause/freeze composition exists in this repo.',
  },
  {
    name: 'Disclosure policies (regulator view)',
    status: 'Not implemented',
    note: 'Single-receiver confidential module; no viewing-key mechanism in the pinned version.',
  },
  {
    name: 'Threshold issuer control (e.g. 2-of-3)',
    status: 'Requires adaptation',
    note: 'OZ Compact multisig modules exist in the pinned package; not composed here.',
  },
] as const;

export default function SolutionRwa() {
  useEffect(() => {
    document.title = 'RWA tokens — Midnight solutions';
  }, []);

  return (
    <div className="portal-page">
      <LpNav active="/solutions" />
      <div className="portal-inner prose">
        <header className="portal-hero left">
          <span className="overline">Solutions · RWA tokens</span>
          <h1>A money-market fund share, composed</h1>
          <p className="home-sub">
            The RWA thesis in one sentence: same blocks as the deposit, different policy
            composition. <strong>This solution is a design page — the RWA application is not
            built yet</strong>, and every capability below carries its real status.
          </p>
        </header>

        <h2>What changes from the deposit</h2>
        <p>
          A fund share adds compliance to the asset itself: who may hold it (eligibility,
          allowlists), how it may move (transfer restrictions, pause/freeze), and what must be
          disclosed (per-jurisdiction policies). What does not change: custody requirements,
          privacy machinery, controlled issuance, public settlement. The confidential contract
          token&apos;s caller-gating design — every caller-authenticating circuit returns the
          authenticated account id — exists precisely so a composing wrapper can enforce these
          policies soundly.
        </p>

        <h2>Capability status</h2>
        <table className="standards-table">
          <thead>
            <tr>
              <th scope="col">Capability</th>
              <th scope="col">Status</th>
              <th scope="col">Evidence / note</th>
            </tr>
          </thead>
          <tbody>
            {CAPABILITIES.map((c) => (
              <tr key={c.name}>
                <th scope="row">{c.name}</th>
                <td>
                  <StatusBadge status={c.status} />
                </td>
                <td>{c.note}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>One family of products</h2>
        <p>
          Fund shares, bonds, deposits and e-money reuse the same building blocks with different
          policy compositions:
        </p>
        <table className="standards-table">
          <thead>
            <tr>
              <th scope="col">Product</th>
              <th scope="col">Base model</th>
              <th scope="col">What its composition adds</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Tokenised deposit</th>
              <td>Confidential contract token</td>
              <td>Public supply attestation; issuer mint/burn against a core ledger</td>
            </tr>
            <tr>
              <th scope="row">Money-market fund share</th>
              <td>Confidential contract token</td>
              <td>Eligibility allowlist, transfer restrictions, disclosure policy</td>
            </tr>
            <tr>
              <th scope="row">Bond</th>
              <td>Confidential contract token</td>
              <td>Transfer windows, coupon operations, maturity redemption</td>
            </tr>
            <tr>
              <th scope="row">E-money</th>
              <td>Confidential contract token</td>
              <td>Velocity/limit policies, freeze, redemption at par</td>
            </tr>
          </tbody>
        </table>
        <p className="muted">
          Every row above except the deposit&apos;s demonstrated core is design intent. See{' '}
          <Link to="/solutions/tokenised-deposits" className="inline-link">tokenised deposits</Link>{' '}
          for what runs today.
        </p>
      </div>
    </div>
  );
}
