/**
 * "Run the stack on your machine" — for a cold visitor on the hosted page who
 * needs Local development mode (Stagenet outage, faucet trouble, or just
 * wanting the instant pre-funded flow).
 *
 * The commands pull three containers (node, indexer, proof server) pinned to
 * the same versions the studio is built against. Browser reality, measured
 * from the deployed origin:
 *
 *  - Chromium browsers ask once for "local network access" — allowed, the
 *    hosted page reaches the local stack (fetch + WebSocket verified).
 *  - Firefox hangs plaintext localhost fetches from an HTTPS page
 *    (HTTPS-First), so hosted-page + local stack does not work there.
 */

import { useState } from 'react';

import { isHostedPage, switchNetwork } from '@mra/lab-shell';

export const LOCAL_STACK_COMMANDS = [
  `curl -fsSL ${typeof location !== 'undefined' ? location.origin : ''}/localnet.yml -o midnight-localnet.yml`,
  'docker compose -f midnight-localnet.yml up -d',
];
const COMMANDS = LOCAL_STACK_COMMANDS;

export default function LocalStackHelp({ title }: { readonly title: string }) {
  const [copied, setCopied] = useState<number | null>(null);

  const copy = (text: string, index: number) => {
    try {
      void navigator.clipboard.writeText(text);
      setCopied(index);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="st-card st-stack">
      <div className="st-strong">{title}</div>
      <div className="st-body-sm">
        Local development runs the Midnight stack on your machine: node, indexer and proof
        server, three containers. Requires{' '}
        <a href="https://docs.docker.com/get-docker/" target="_blank" rel="noreferrer">
          Docker
        </a>
        . Wallets come pre-funded; no faucet is involved.
      </div>
      {COMMANDS.map((command, i) => (
        <div key={command} className="st-inline">
          <code className="mono st-cmd">{command}</code>
          <button className="link" onClick={() => copy(command, i)}>
            {copied === i ? 'copied' : 'copy'}
          </button>
        </div>
      ))}
      <div className="st-muted-sm">
        Windows PowerShell: use <span className="mono">curl.exe</span>. Reset the chain later
        with <span className="mono">docker compose -f midnight-localnet.yml down -v</span>.
      </div>
      {isHostedPage() && (
        <div className="st-muted-sm">
          Chrome asks once to allow local network access — allow it. Firefox cannot reach a
          local stack from a hosted page; use a Chromium-based browser there, or run the studio
          itself locally.
        </div>
      )}
      <div>
        <button className="st-btn outline sm" onClick={() => switchNetwork('localnet')}>
          Switch to Local development
        </button>
      </div>
    </div>
  );
}
