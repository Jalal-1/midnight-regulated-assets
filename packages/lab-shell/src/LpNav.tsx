/**
 * Shared chrome for the design-artboard pages (Landing, Compare, Use Cases,
 * Try): the dark nav with network pill, and the footer with the corrected
 * proving-boundary line. One source so the pages cannot drift.
 */

import { useEffect, useState } from 'react';

import { currentNetworkName } from './network.ts';
import { switchNetwork } from './network.ts';
import { Link } from './router.tsx';
import LogoMark from './Logo.tsx';

/** One command to stand up the local stack — shared with the studio UI. */
export const LOCAL_STACK_COMMANDS = [
  `curl -fsSL ${typeof location !== 'undefined' ? location.origin : ''}/localnet.yml -o midnight-localnet.yml && docker compose -f midnight-localnet.yml up -d`,
];

export function LpNav({ active }: { readonly active?: string }) {
  const stagenet = currentNetworkName() === 'stagenet';
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open]);

  const pick = (name: 'stagenet' | 'localnet') => {
    setOpen(false);
    if ((name === 'stagenet') === stagenet) return; // already active
    switchNetwork(name); // reloads — these pages hold no session state
  };

  const copyCmd = () => {
    try {
      void navigator.clipboard.writeText(LOCAL_STACK_COMMANDS[0]!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };
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
      <span className="lp-netwrap" onClick={(e) => e.stopPropagation()}>
        <button
          className={`lp-netpill lp-netbtn${stagenet ? '' : ' local'}`}
          onClick={() => setOpen((o) => !o)}
          title="Switch network"
        >
          {stagenet ? 'STAGENET' : 'LOCAL'} ▾
        </button>
        {open && (
          <div className="lp-netmenu">
            <button className="lp-netopt" onClick={() => pick('stagenet')}>
              <strong>Stagenet</strong>
              {stagenet && <span className="lp-active">active</span>}
              <span>Public test network — wallets need faucet-funded seeds</span>
            </button>
            <button className="lp-netopt" onClick={() => pick('localnet')}>
              <strong>Local development</strong>
              {!stagenet && <span className="lp-active">active</span>}
              <span>The Midnight stack on your machine — pre-funded wallets</span>
            </button>
            <div className="lp-netcmd">
              <span>Local development needs the stack running (requires Docker):</span>
              <span className="lp-cmdrow">
                <code>{LOCAL_STACK_COMMANDS[0]}</code>
                <button className="lp-copy" onClick={copyCmd}>{copied ? 'copied' : 'copy'}</button>
              </span>
            </div>
          </div>
        )}
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
