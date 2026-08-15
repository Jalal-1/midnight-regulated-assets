/**
 * Remembered confidential-token instances, chain-checked like every other
 * history in this app. Only addresses and chain ids are stored — never any
 * wallet-side plaintext, which lives in memory only.
 */

import { currentNetwork } from '@mra/lab-shell';

import { getGenesisHash } from '../history.ts';
import { readCftView, type CftView } from './confidentialToken.ts';

const STORAGE_KEY = 'mra.cft.contracts.v1';
const MAX_ENTRIES = 50;

export interface StoredCft {
  readonly address: string;
  readonly networkId: string;
  readonly genesis: string;
  readonly deployedAt: number;
}

export type CftState = 'live' | 'not-found' | 'other-chain';

export interface CheckedCft extends StoredCft {
  readonly state: CftState;
  readonly view?: CftView;
}

function readAll(): StoredCft[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredCft[]) : [];
  } catch {
    return [];
  }
}

function writeAll(entries: readonly StoredCft[]): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    /* remembering is a convenience */
  }
}

export function rememberCft(address: string, genesis: string): void {
  const { networkId } = currentNetwork();
  const entries = readAll().filter((entry) => entry.address !== address);
  entries.push({ address, networkId, genesis, deployedAt: Date.now() });
  writeAll(entries);
}

export function forgetCft(address: string): void {
  writeAll(readAll().filter((entry) => entry.address !== address));
}

export async function loadCheckedCfts(): Promise<CheckedCft[]> {
  const { networkId } = currentNetwork();
  const mine = readAll().filter((entry) => entry.networkId === networkId);
  if (mine.length === 0) return [];

  let genesis: string | undefined;
  try {
    genesis = await getGenesisHash();
  } catch {
    return mine.reverse().map((entry) => ({ ...entry, state: 'other-chain' as const }));
  }

  const checked = await Promise.all(
    mine.map(async (entry): Promise<CheckedCft> => {
      if (entry.genesis !== genesis) return { ...entry, state: 'other-chain' };
      try {
        const view = await readCftView(entry.address);
        return view ? { ...entry, state: 'live', view } : { ...entry, state: 'not-found' };
      } catch {
        return { ...entry, state: 'not-found' };
      }
    }),
  );

  return checked.reverse();
}
