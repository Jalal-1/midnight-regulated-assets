/**
 * Registry of tokens deployed from this browser — PUBLIC data only (contract
 * address, name, symbol, kind, network). No seeds, no keys, no balances.
 * Persisted in localStorage so the token dashboard can list every deployment
 * across sessions; the chain remains the source of truth for state, and a
 * registry entry whose contract no longer exists (e.g. a wiped localnet) is
 * shown as unreachable with a remove control, never silently dropped.
 */

import type { TokenKind } from './useStudioChain.ts';

const KEY = 'mra.tokens.v1';

export interface RegisteredToken {
  readonly address: string;
  readonly kind: TokenKind;
  readonly name: string;
  readonly symbol: string;
  /** Network id the token was deployed to ('stagenet' | 'undeployed'). */
  readonly network: string;
  /** UTXO kinds: the raw native token type minted by the contract. */
  readonly tokenType?: string;
  readonly deployedAt: string;
}

function readAll(): RegisteredToken[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RegisteredToken[]) : [];
  } catch {
    return [];
  }
}

function writeAll(tokens: readonly RegisteredToken[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(tokens));
  } catch {
    /* private browsing */
  }
}

/** Tokens registered for one network, newest first. */
export function listTokens(network: string): RegisteredToken[] {
  return readAll()
    .filter((t) => t.network === network)
    .sort((a, b) => b.deployedAt.localeCompare(a.deployedAt));
}

export function getToken(address: string): RegisteredToken | undefined {
  return readAll().find((t) => t.address === address);
}

export function addToken(token: RegisteredToken): void {
  const rest = readAll().filter((t) => t.address !== token.address);
  writeAll([...rest, token]);
}

export function removeToken(address: string): void {
  writeAll(readAll().filter((t) => t.address !== address));
}
