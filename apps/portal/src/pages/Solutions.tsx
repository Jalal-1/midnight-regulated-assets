/**
 * Use Cases — implemented from the "Use Cases" design artboard, with two
 * corrections against the repository:
 *
 *  - Tokenised deposits: redemption is HOLDER-initiated in the demonstrated
 *    CFT (the artboard said "the issuer keeps mint and redemption").
 *  - Real-world assets: allowlists / transfer restrictions / disclosure policy
 *    are design requirements, not shipped capability — the artboard presented
 *    them as living in the asset today. The base token primitive is what has
 *    a working example.
 *
 * The artboard's ROADMAP label becomes DESIGN OPTION (audit vocabulary: no
 * roadmap claim without an owner and acceptance criteria).
 */

import { useEffect } from 'react';

import { Link } from '@mra/lab-shell';

import { LpFooter, LpNav } from './lp.tsx';

const OPTIONS = [
  {
    name: 'Private digital cash',
    body: 'A bearer-style instrument with cash-like privacy at the ledger level.',
    icon: 'cash',
  },
  {
    name: 'DvP settlement',
    body: 'Atomic delivery-versus-payment: the asset and the payment move together, or not at all.',
    icon: 'dvp',
  },
  {
    name: 'Interbank settlement',
    body: 'Settlement between institutions, with balances visible only to the parties involved.',
    icon: 'banks',
  },
] as const;

export default function Solutions() {
  useEffect(() => {
    document.title = 'Use cases — Midnight regulated assets';
  }, []);

  return (
    <div className="lp-page">
      <LpNav active="/solutions" />
      <header className="lp-head uc-hero">
        <div className="lp-glow uc-glow" />
        <div className="lp-overline">USE CASES</div>
        <h1>Built for regulated money</h1>
        <p>
          Every use case composes the same building blocks — privacy, issuer control and
          disclosure, tuned per instrument.
        </p>
      </header>

      <section className="lp-wide uc-two">
        <Link to="/solutions/tokenised-deposits" className="uc-card">
          <span className="uc-icon stack">
            <i /><i /><i />
          </span>
          <h2>Tokenised deposits</h2>
          <p>
            Commercial-bank money onchain — the bank remains the debtor. Balances and amounts
            stay encrypted, supply stays public for reconciliation, and the composition pairs
            owner-gated mint with holder-initiated redemption.
          </p>
          <span className="uc-tags">
            <span>Encrypted balances</span>
            <span>Public supply</span>
            <span>Owner mint · holder redemption</span>
          </span>
          <span className="uc-cta">Explore →</span>
        </Link>
        <Link to="/solutions/rwa" className="uc-card">
          <span className="uc-icon pair">
            <i className="sq" /><i className="ci" />
          </span>
          <h2>Real-world assets</h2>
          <p>
            Regulated assets with compliance as part of the token — the target composition is a
            money-market fund share. Allowlists, transfer restrictions and disclosure policy are
            design requirements, not yet implemented; the base token primitive has a working
            example.
          </p>
          <span className="uc-tags">
            <span>Allowlists — design</span>
            <span>Transfer restrictions — design</span>
            <span>Disclosure policy — design</span>
          </span>
          <span className="uc-cta">Explore →</span>
        </Link>
      </section>

      <section className="lp-wide uc-three">
        {OPTIONS.map((o) => (
          <div key={o.name} className="uc-mini">
            <span className={`uc-icon ${o.icon}`}>
              {o.icon === 'cash' && (<><i className="ci solid" /><i className="ci ring" /></>)}
              {o.icon === 'dvp' && (<><i className="sq solid" /><i className="bar" /><i className="sq ring" /></>)}
              {o.icon === 'banks' && (<><i className="dotb" /><i className="dotb" /><i className="dotb" /><i className="dotb" /></>)}
            </span>
            <h3>{o.name}</h3>
            <p>{o.body}</p>
            <span className="uc-flag">DESIGN OPTION</span>
          </div>
        ))}
      </section>
      <LpFooter />
    </div>
  );
}
