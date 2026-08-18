/**
 * Which network this BROWSER session is pointed at.
 *
 * The choice lives in localStorage and is applied by full page reload, on
 * purpose: midnight-js keeps the network id in module-level global state and
 * the wallet SDK captures endpoints at construction, so switching networks
 * inside a running page would leave half the stack on the old chain. A reload
 * makes the switch atomic.
 *
 * Stagenet is the default everywhere; an explicit choice (localStorage) wins.
 * The proof server stays LOCAL either way.
 */

import { getNetwork, networks, type NetworkConfig, type NetworkName } from '@mra/network';

const KEY = 'mra.network.v1';

/** True when this page is served from somewhere other than the viewer's machine. */
export function isHostedPage(): boolean {
  return (
    typeof location !== 'undefined' &&
    !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
  );
}

export function currentNetworkName(): NetworkName {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored && stored in networks) return stored as NetworkName;
  } catch {
    /* private browsing */
  }
  return 'stagenet';
}

export function currentNetwork(): NetworkConfig {
  return getNetwork(currentNetworkName());
}

export function switchNetwork(name: NetworkName): void {
  try {
    localStorage.setItem(KEY, name);
  } catch {
    /* private browsing — the reload will just land on the default */
  }
  location.reload();
}
