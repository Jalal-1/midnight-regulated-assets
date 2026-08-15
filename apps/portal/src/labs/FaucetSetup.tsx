/**
 * Stagenet-only first-time wallet setup: funding + DUST designation.
 *
 * One row per persona wallet. "Open faucet" copies the wallet's address to the
 * clipboard and opens the faucet — the faucet is Turnstile-gated and ignores
 * URL parameters (probed), so paste + captcha is genuinely all that remains.
 *
 * The row polls the REAL wallet state and walks itself through the sequence a
 * first-time wallet needs: waiting for funds → registering its NIGHT for DUST
 * generation (designating its own DUST address; the registration pays its own
 * fee from projected generation) → DUST accruing. Registration triggers
 * automatically the moment funds arrive; every step is logged to the lab log.
 *
 * Never rendered on localnet: genesis wallets arrive funded and pre-registered.
 */

import { useEffect, useRef, useState } from 'react';

import { currentNetwork } from '@mra/lab-shell';
import {
  dustSetupStatus,
  ensureDustGeneration,
  formatDust,
  formatNight,
  type DustSetupStatus,
  type MidnightWallet,
} from '@mra/wallet';

const POLL_MS = 8000;

export interface FaucetSetupProps {
  readonly label: string;
  readonly wallet: MidnightWallet;
  /** bech32m unshielded address — what the faucet wants. */
  readonly address: string;
  readonly say: (message: string, kind?: 'info' | 'ok' | 'error') => void;
}

export default function FaucetSetup({ label, wallet, address, say }: FaucetSetupProps) {
  const [status, setStatus] = useState<DustSetupStatus | null>(null);
  const [registering, setRegistering] = useState(false);
  const registered = useRef(false);
  const network = currentNetwork();

  useEffect(() => {
    let live = true;
    const tick = async () => {
      try {
        const next = await dustSetupStatus(wallet);
        if (!live) return;
        setStatus(next);
        // Funds just arrived and nothing is generating: designate the DUST
        // address (itself) and register — the one-time first-wallet step.
        if (next.unregistered > 0 && !registered.current) {
          registered.current = true;
          setRegistering(true);
          say(`${label}: NIGHT arrived — designating DUST address (one-time registration)…`);
          try {
            const result = await ensureDustGeneration(wallet, {
              onProgress: (m) => say(`${label}: ${m}`),
            });
            if (result.outcome === 'registered') {
              say(`${label}: DUST generation registered — fees payable once DUST accrues`, 'ok');
            }
          } catch (error) {
            registered.current = false; // allow retry on next poll
            say(`${label}: DUST registration failed: ${String(error).slice(0, 160)}`, 'error');
          } finally {
            setRegistering(false);
          }
        }
      } catch {
        /* wallet still syncing — next poll */
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [label, say, wallet]);

  const openFaucet = () => {
    try {
      void navigator.clipboard.writeText(address);
      say(`${label}: address copied — paste it into the faucet`, 'ok');
    } catch {
      /* clipboard unavailable — the address is shown in full on hover */
    }
    window.open(network.faucet ?? 'https://faucet.stagenet.shielded.tools', '_blank', 'noopener');
  };

  const state = !status
    ? 'reading wallet…'
    : registering
      ? 'registering DUST generation (one-time)…'
      : status.nightStars === 0n
        ? 'waiting for faucet funds'
        : status.registered > 0
          ? `${formatNight(status.nightStars)} NIGHT · ${formatDust(status.dustSpecks)} DUST — generating`
          : `${formatNight(status.nightStars)} NIGHT — registration pending`;

  return (
    <div className="faucet-row">
      <span className="faucet-label">{label}</span>
      <span className="mono muted small faucet-addr" title={address}>
        {address.slice(0, 16)}…{address.slice(-8)}
      </span>
      <button
        className="link"
        onClick={() => {
          try {
            void navigator.clipboard.writeText(address);
            say(`${label}: address copied`, 'ok');
          } catch {
            /* clipboard unavailable */
          }
        }}
        title="Copy the full address"
      >
        copy
      </button>
      <button className="faucet-open" onClick={openFaucet} title="Copies the address, then opens the faucet — paste and solve the captcha">
        Open faucet ↗
      </button>
      <span className="muted small faucet-state">{state}</span>
    </div>
  );
}
