/**
 * Remembers tokens this browser has deployed, so you can come back to one.
 *
 * Same discipline as the counter's history: every entry records the chain it
 * was deployed to (genesis hash), and is re-checked on load — a localnet reset
 * must show as "previous chain", never as a selectable token. For live entries
 * the row carries the REAL on-chain identity (name, symbol, supply), read from
 * the indexer, so the list shows what the chain says a token is, not what this
 * browser remembers calling it.
 */

import { getNetwork } from '@mra/network';

import { getGenesisHash } from '../history.ts';
import { readPublicView, type PublicView } from './publicToken.ts';

const STORAGE_KEY = 'mra.unshielded-token.contracts.v1';
const MAX_ENTRIES = 50;

export interface StoredToken {
  readonly address: string;
  readonly networkId: string;
  readonly genesis: string;
  readonly deployedAt: number;
}

export type TokenState = 'live' | 'not-found' | 'other-chain';

export interface CheckedToken extends StoredToken {
  readonly state: TokenState;
  /** Present for live tokens — the chain's own account of the token. */
  readonly view?: PublicView;
}

function readAll(): StoredToken[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredToken[]) : [];
  } catch {
    return [];
  }
}

function writeAll(entries: readonly StoredToken[]): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    /* private browsing, quota — remembering is a convenience */
  }
}

export function rememberToken(address: string, genesis: string): void {
  const { networkId } = getNetwork();
  const entries = readAll().filter((entry) => entry.address !== address);
  entries.push({ address, networkId, genesis, deployedAt: Date.now() });
  writeAll(entries);
}

export function forgetToken(address: string): void {
  writeAll(readAll().filter((entry) => entry.address !== address));
}

/** Newest first, each checked against the current chain. */
export async function loadCheckedTokens(): Promise<CheckedToken[]> {
  const { networkId } = getNetwork();
  const mine = readAll().filter((entry) => entry.networkId === networkId);
  if (mine.length === 0) return [];

  let genesis: string | undefined;
  try {
    genesis = await getGenesisHash();
  } catch {
    // Node unreachable: report everything as other-chain rather than claim live.
    return mine.reverse().map((entry) => ({ ...entry, state: 'other-chain' as const }));
  }

  const checked = await Promise.all(
    mine.map(async (entry): Promise<CheckedToken> => {
      if (entry.genesis !== genesis) return { ...entry, state: 'other-chain' };
      try {
        const view = await readPublicView(entry.address);
        return view ? { ...entry, state: 'live', view } : { ...entry, state: 'not-found' };
      } catch {
        return { ...entry, state: 'not-found' };
      }
    }),
  );

  return checked.reverse();
}
