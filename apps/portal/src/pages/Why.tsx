/**
 * Why Midnight — the value proposition for regulated assets, stated for an
 * audience that already understands blockchain fundamentals.
 */

import { useEffect } from 'react';

import { Link } from '@mra/lab-shell';

import { LpNav } from './lp.tsx';

export default function Why() {
  useEffect(() => {
    document.title = 'Why Midnight — regulated assets';
  }, []);

  return (
    <div className="portal-page">
      <LpNav active="/why" />
      <div className="portal-inner prose">
        <header className="portal-hero left">
          <span className="overline">Why Midnight</span>
          <h1>Privacy you can configure, on rails you can share</h1>
        </header>

        <p>
          Public chains force a choice no regulated institution can make: broadcast every balance
          and flow, or leave public infrastructure altogether. Midnight removes that choice. A
          contract holds <strong>public and private state side by side</strong> — so an issuer
          decides, per instrument, what the world sees, what counterparties see, and what only the
          holder sees, and the chain enforces the decision with zero-knowledge proofs rather than
          promises.
        </p>

        <p>
          The consequence for regulated assets is that <em>disclosure becomes a design parameter</em>.
          The same building blocks compose into a fully public token (the transparency baseline),
          a confidential token whose balances and amounts are encrypted while its supply stays
          attestable, or — as the standards mature — note-based instruments with graph privacy.
          The <Link to="/compare" className="inline-link">comparison</Link> puts the five models
          side by side with their exact trade-offs.
        </p>

        <h2>Proving stays local</h2>
        <p>
          Zero-knowledge proofs are generated on the operator&apos;s own machine, next to the
          wallet. The witness — amounts, keys, counterparties — is the proof&apos;s input and
          never crosses the network boundary; the network verifies validity in milliseconds
          without seeing contents. This is a materially different trust boundary from designs
          that ship transaction contents to a third party, and every lab here shows the local
          prover doing this on real transactions.
        </p>

        <h2>Custody is a first-class constraint</h2>
        <p>
          These products have been designed to work with established institutional security
          architectures. Their design has been shaped through extensive technical feedback from
          custodians, with compatibility for controls such as HSM-backed key management, MPC,
          multisig and threshold approval policies such as 2-of-3.
        </p>
        <p>
          That sentence is a design statement, and this portal is careful about the difference
          between design and integration. The mechanisms are not interchangeable: an HSM protects
          or operates on key material; MPC distributes cryptographic operations; multisig requires
          multiple independent authorisations; a 2-of-3 policy can be enforced by any of them or
          by operational controls. Some Midnight models authorise with conventional signatures
          (custody-friendly today); others authorise with proofs over witness material, which
          changes what a custodian must protect. Each model&apos;s page states which case it is
          in, and no model here is described as custodian-validated — none has completed such a
          validation.
        </p>

        <h2>Evidence-led, end to end</h2>
        <p>
          Every interactive example uses the real Midnight node, wallet, proving and indexer
          stack. Each example states whether it has been verified on localnet or Stagenet.
          Nothing on this portal is simulated, and every status badge traces to code, tests, or
          the engineering field notes in the repository.
        </p>

        <div className="cta-row">
          <Link to="/compare" className="cta primary">
            Compare asset models
          </Link>
          <Link to="/learn" className="cta secondary">
            Learn &amp; Try
          </Link>
        </div>
      </div>
    </div>
  );
}
