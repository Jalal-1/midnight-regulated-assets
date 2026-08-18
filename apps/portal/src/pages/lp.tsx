/**
 * Shared chrome for the design-artboard pages (Landing, Compare, Use Cases,
 * Try): the dark nav with network pill, and the footer with the corrected
 * proving-boundary line. One source so the pages cannot drift.
 */

import { currentNetworkName, Link, LogoMark } from '@mra/lab-shell';

export function LpNav({ active }: { readonly active?: string }) {
  const stagenet = currentNetworkName() === 'stagenet';
  const links = [
    ['Why Midnight', '/why'],
    ['Compare', '/compare'],
    ['Use Cases', '/solutions'],
    ['Try', '/try'],
    ['Dashboard', '/studio'],
  ] as const;
  return (
    <nav className="lp-nav">
      <Link to="/" className="lp-brand">
        <LogoMark className="lp-logo" />
        Regulated assets on Midnight
      </Link>
      <span className="lp-links">
        {links.map(([label, to]) => (
          <Link key={to} to={to} className={active === to ? 'active' : ''}>
            {label}
          </Link>
        ))}
      </span>
      <span className={`lp-netpill${stagenet ? '' : ' local'}`}>
        {stagenet ? 'STAGENET' : 'LOCAL'}
      </span>
    </nav>
  );
}

export function LpFooter() {
  return (
    <footer className="lp-footer">
      <p>
        Every example runs on the real Midnight node, wallet, proving and indexer stack.
        Proving runs on your own machine by default — witness-bearing inputs stay within that
        configured local boundary.
      </p>
    </footer>
  );
}
