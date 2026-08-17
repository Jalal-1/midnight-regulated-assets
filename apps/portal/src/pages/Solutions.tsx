/**
 * Solutions — the product view: what an institution is actually trying to
 * ship, mapped onto the asset models with demonstrated/designed/gap honesty.
 */

import { useEffect } from 'react';

import { Link, SiteNav } from '@mra/lab-shell';

export default function Solutions() {
  useEffect(() => {
    document.title = 'Solutions — Midnight regulated assets';
  }, []);

  return (
    <div className="portal-page">
      <SiteNav />
      <div className="portal-inner">
        <header className="portal-hero left">
          <span className="overline">Solutions</span>
          <h1>From asset model to financial product</h1>
          <p className="home-sub">
            Products are compositions of the same building blocks; the issuer decides the
            composition. Each solution page separates what is demonstrated today, what is
            designed, and what remains a gap.
          </p>
        </header>

        <div className="model-cards">
          <Link to="/solutions/tokenised-deposits" className="model-card">
            <div className="model-card-head">
              <strong>Tokenised deposits</strong>
            </div>
            <span className="card-desc">
              Commercial bank money on public rails: controlled issuance and redemption, customer
              privacy, documented custody and disclosure requirements, public settlement.
            </span>
            <span className="landing-cta">Read the solution →</span>
          </Link>
          <Link to="/solutions/rwa" className="model-card">
            <div className="model-card-head">
              <strong>RWA tokens</strong>
            </div>
            <span className="card-desc">
              A money-market fund share with compliance built into the asset: allowlists,
              transfer restrictions, eligibility, disclosure policy — each marked by real
              implementation status.
            </span>
            <span className="landing-cta">Read the solution →</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
