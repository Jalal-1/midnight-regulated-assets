/**
 * Remembers contracts this browser has deployed, so you can switch back to one.
 *
 * The hard part is not storage, it is **knowing when a remembered address is
 * meaningless**. A localnet restart produces a brand-new chain: the addresses
 * survive in localStorage but nothing on the new chain answers to them. Offering
 * those as though they were usable is worse than not remembering at all.
 *
 * So every entry records the chain it was deployed to, identified by its genesis
 * block hash (`chain_getBlockHash(0)`), and is checked on load:
 *
 *   live       genesis matches, and the indexer still has state for it
 *   not-found  right chain, but no contract there (should not normally happen)
 *   other-chain deployed to a previous chain — the localnet was reset
 *
 * Only `live` entries can be selected.
 */

import { getNetwork } from '@mra/network';

const STORAGE_KEY = 'mra.counter.contracts.v1';
const MAX_ENTRIES = 50;

export interface StoredContract {
  readonly address: string;
  /** midnight-js network id, e.g. 'undeployed'. */
  readonly networkId: string;
  /** Genesis block hash — identifies the specific chain instance. */
  readonly genesis: string;
  readonly deployedAt: number;
}

export type ContractState = 'live' | 'not-found' | 'other-chain';

export interface CheckedContract extends StoredContract {
  readonly state: ContractState;
  /** Present for live contracts. */
  readonly round?: bigint;
}

function readAll(): StoredContract[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredContract[]) : [];
  } catch {
    // Corrupt or unavailable storage must not break the app.
    return [];
  }
}

function writeAll(entries: readonly StoredContract[]): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    /* private browsing, quota, etc. — remembering is a convenience, not a feature */
  }
}

/** The genesis hash of the chain we are currently pointed at. */
export async function getGenesisHash(): Promise<string> {
  const { node } = getNetwork();
  const response = await fetch(node, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'chain_getBlockHash', params: [0] }),
  });
  const { result } = await response.json();
  if (typeof result !== 'string') throw new Error('could not read genesis hash');
  return result;
}

/** Record a freshly deployed contract. Newest last. */
export function remember(address: string, genesis: string): void {
  const { networkId } = getNetwork();
  const entries = readAll().filter((entry) => entry.address !== address);
  entries.push({ address, networkId, genesis, deployedAt: Date.now() });
  writeAll(entries);
}

export function forget(address: string): void {
  writeAll(readAll().filter((entry) => entry.address !== address));
}

export function forgetAll(): void {
  writeAll([]);
}

/**
 * Load history for the current network and work out what is still usable.
 *
 * Newest first, because that is the order you want to pick from. Reads each live
 * contract's round in the same pass so the list can show it without a second
 * round-trip per row.
 */
export async function loadChecked(
  readRound: (address: string) => Promise<bigint | null>,
): Promise<CheckedContract[]> {
  const { networkId } = getNetwork();
  const mine = readAll().filter((entry) => entry.networkId === networkId);
  if (mine.length === 0) return [];

  let genesis: string | undefined;
  try {
    genesis = await getGenesisHash();
  } catch {
    // Node unreachable: report everything as other-chain rather than claim it is
    // live. A wrong "live" badge sends the user into a failing transaction.
    return mine.reverse().map((entry) => ({ ...entry, state: 'other-chain' as const }));
  }

  const checked = await Promise.all(
    mine.map(async (entry): Promise<CheckedContract> => {
      if (entry.genesis !== genesis) return { ...entry, state: 'other-chain' };
      try {
        const round = await readRound(entry.address);
        return round === null
          ? { ...entry, state: 'not-found' }
          : { ...entry, state: 'live', round };
      } catch {
        return { ...entry, state: 'not-found' };
      }
    }),
  );

  return checked.reverse();
}
