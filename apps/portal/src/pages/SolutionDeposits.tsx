/**
 * Solution: tokenised deposits. The page keeps three registers rigorously
 * apart — demonstrated today / designed architecture / remaining gaps — and
 * never claims custody controls the current examples do not implement.
 */

import { useEffect } from 'react';

import { getModel } from '@mra/asset-models';
import { Link, SiteNav, StatusBadge, VisibilityMatrix } from '@mra/lab-shell';

export default function SolutionDeposits() {
  useEffect(() => {
    document.title = 'Tokenised deposits — Midnight solutions';
  }, []);

  const cft = getModel('confidential-account-token')!;
  const publicToken = getModel('public-account-token')!;

  return (
    <div className="portal-page">
      <SiteNav />
      <div className="portal-inner prose">
        <header className="portal-hero left">
          <span className="overline">Solutions · Tokenised deposits</span>
          <h1>Commercial bank money on public rails</h1>
          <p className="home-sub">
            A bank issues deposits as tokens; customers transact without broadcasting balances
            and flows; the bank keeps issuer control; the regulator retains access; settlement
            happens on shared public infrastructure. Impossible on transparent chains, unpalatable
            in walled gardens.
          </p>
        </header>

        <h2>What the product requires</h2>
        <ul>
          <li>Controlled issuance and redemption (mint against a core-ledger liability, burn on redemption)</li>
          <li>Customer privacy: balances and payment amounts not broadcast to the world</li>
          <li>Custody-grade control of issuer keys — HSM/MPC/multisig, threshold approvals such as 2-of-3</li>
          <li>Regulatory access to a differentiated view</li>
          <li>Public settlement and interoperability</li>
          <li>Recovery and compliance operations</li>
        </ul>

        <h2>Which asset model fits</h2>
        <p>
          The <Link to={publicToken.route} className="inline-link">public contract token</Link>{' '}
          satisfies control and interoperability but fails privacy by construction — its lab
          exists as the transparency baseline, where anyone can enumerate every holder. The{' '}
          <Link to={cft.route} className="inline-link">confidential contract token</Link> is the
          closest demonstrated fit: balances and transfer amounts are encrypted, the issuer keeps
          mint and compliance-burn control, and total supply stays public so the bank can attest
          1:1 backing. Native and note-based models trade away issuer control or custody
          compatibility — the <Link to="/compare" className="inline-link">comparison</Link> makes
          those trades explicit.
        </p>

        <h2>Demonstrated today</h2>
        <p>
          <StatusBadge status={cft.verification} />
        </p>
        <ul>
          <li>
            Full confidential lifecycle on localnet: deploy → encryption-key registration → issue
            1,000.00 → sweep → transfer 250.00 with the amount hidden → sweep → redeem 500.00 —
            as a <Link to="/labs/confidential-token" className="inline-link">browser lab</Link>{' '}
            and a Node reference script.
          </li>
          <li>Public supply attestation via the PublicSupply extension (each mint/redeem visible as a delta).</li>
          <li>Owner-gated mint and compliance burn (OpenZeppelin Ownable).</li>
          <li>Local proving throughout: witness material never leaves the operator&apos;s machine.</li>
        </ul>
        <VisibilityMatrix model={cft} />

        <h2>Designed architecture</h2>
        <p>
          The broader product architecture was shaped through extensive technical feedback from
          custodians and is designed to integrate with existing HSM, MPC, multisig and
          threshold-control environments. The pinned OpenZeppelin package ships the ECDSA Signer
          and multisig modules (2-of-3 capable) intended to replace the single-secret Ownable
          gate with genuine threshold issuer control. Designed, in this register, means exactly
          that — the integration below is what does not exist yet.
        </p>

        <h2>Remaining gaps — stated plainly</h2>
        <ul>
          <li>
            <strong>Custody:</strong> the current example gates the issuer with{' '}
            <span className="mono">Ownable</span> — a single witness secret. It does NOT implement
            2-of-3 or any multisig. Composing the OZ multisig modules is the designed path;{' '}
            <StatusBadge status={cft.custody.multisig.status} />.
          </li>
          <li>
            <strong>Recovery:</strong> no key-recovery or account-recovery mechanism is
            implemented.
          </li>
          <li>
            <strong>Regulatory disclosure:</strong> {cft.regulatoryDisclosure}{' '}
            <StatusBadge status="Not implemented" />
          </li>
          <li>
            <strong>Graph privacy:</strong> counterparty ids are public on every transfer — a
            property of this model, not a bug; fully graph-private deposits await the note-based
            standards.
          </li>
          <li>
            <strong>Dependency maturity:</strong> a locally patched alpha of the OpenZeppelin
            standards, compiled with a documented ZKIR v3 opt-out — see{' '}
            <Link to="/standards" className="inline-link">Standards &amp; assurance</Link>. Not
            audited, not production-ready.
          </li>
          <li>
            <strong>Network:</strong> demonstrated on localnet; not yet run on Stagenet (wallet
            connectivity is Stagenet-verified; the lifecycle is not).
          </li>
        </ul>
      </div>
    </div>
  );
}
