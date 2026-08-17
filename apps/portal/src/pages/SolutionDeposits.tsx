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
          <h1>Commercial-bank money, represented onchain</h1>
          <p className="home-sub">
            A tokenised deposit remains a liability of the issuing bank. This prototype evaluates
            how that claim could move on Midnight with confidential balances and amounts, public
            supply reconciliation and programmable settlement. The demonstrated CFT still exposes
            account relationships and does not yet implement regulatory viewing, participant
            restrictions, recovery, administrative seizure or institutional custody.
          </p>
        </header>

        <h2>What the product requires</h2>
        <ul>
          <li>Controlled issuance and redemption (mint against a core-ledger liability, burn on redemption)</li>
          <li>Customer privacy: balances and payment amounts not broadcast to the world</li>
          <li>Institutional custody of issuer keys — HSM, MPC or threshold approval (integration targets, not implemented here)</li>
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
          closest demonstrated fit: balances and transfer amounts are encrypted; stable account
          identifiers and the counterparty graph remain public. The wrapper provides owner-gated
          mint and holder-initiated redemption — no built-in auditor view, freeze or unilateral
          seizure. Public onchain supply supports reconciliation against a separately attested
          bank-liability ledger; token supply alone does not prove reserves or 1:1 backing.
          Native models are closer to conventional holder signing but have no post-mint issuer
          mediation; the note-based design is a closed, unmerged research exploration — the <Link to="/compare" className="inline-link">comparison</Link> makes
          those trades explicit.
        </p>

        <h2>Working examples</h2>
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
          <li>Public onchain supply via the PublicSupply extension — each mint/redeem delta is publicly visible; reconciliation input, not proof of backing.</li>
          <li>Owner-gated mint and holder-initiated redemption (OpenZeppelin Ownable).</li>
          <li>Proving via the configured proving service — a local process by default; a hosted prover changes the trust boundary.</li>
        </ul>
        <VisibilityMatrix model={cft} />

        <h2>Designed architecture</h2>
        <p>
          Current demo authority is a single browser-held Ownable witness. HSM, MPC and
          threshold approval are integration targets, not implemented capabilities. The pinned
          OpenZeppelin alpha ships multisig contract structure, but its signature verification is
          stubbed pending ECDSA and Keccak primitives — it is not production custody evidence.
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
