/**
 * Which network this BROWSER session is pointed at.
 *
 * The choice lives in localStorage and is applied by full page reload, on
 * purpose: midnight-js keeps the network id in module-level global state and
 * the wallet SDK captures endpoints at construction, so switching networks
 * inside a running page would leave half the stack on the old chain. A reload
 * makes the switch atomic.
 *
 * Localnet is the default. Stagenet is the hosted public test network — real
 * endpoints from packages/network; the proof server stays LOCAL either way
 * (witness data never leaves this machine).
 */

import { getNetwork, networks, type NetworkConfig, type NetworkName } from '@mra/network';

const KEY = 'mra.network.v1';

export function currentNetworkName(): NetworkName {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored && stored in networks) return stored as NetworkName;
  } catch {
    /* private browsing */
  }
  return 'localnet';
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
