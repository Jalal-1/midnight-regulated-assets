/**
 * Live chain telemetry for the topbar — every number polled from the connected
 * network, nothing synthesized.
 *
 *   node height     chain_getHeader on the node RPC
 *   node health     system_health (peer count, sync flag)
 *   node version    system_version, fetched once
 *   indexer height  { block { height hash timestamp } } on the indexer GraphQL
 *   block time      rolling average of indexer block-timestamp deltas,
 *                   measured across observed height changes this session
 *   proof server    GET / on the local prover
 *
 * Polls every 4 s while the tab is visible. A request that fails marks that
 * service unreachable until it answers again — the ticker is also the
 * connectivity indicator.
 */

import { useEffect, useRef, useState } from 'react';

import { currentNetwork } from '@mra/lab-shell';

const POLL_MS = 4000;

export interface ChainTicker {
  readonly nodeOk: boolean | null;
  readonly indexerOk: boolean | null;
  readonly proofOk: boolean | null;
  readonly nodeHeight: number | null;
  readonly indexerHeight: number | null;
  readonly blockHash: string | null;
  /** ms since the latest indexed block's timestamp. */
  readonly blockAgeMs: number | null;
  /** Rolling average seconds per block, from observed deltas. */
  readonly blockSeconds: number | null;
  readonly peers: number | null;
  readonly syncing: boolean | null;
  readonly nodeVersion: string | null;
}

const INITIAL: ChainTicker = {
  nodeOk: null, indexerOk: null, proofOk: null,
  nodeHeight: null, indexerHeight: null, blockHash: null,
  blockAgeMs: null, blockSeconds: null, peers: null, syncing: null, nodeVersion: null,
};

async function rpc(url: string, method: string): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [] }),
  });
  if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`);
  return ((await res.json()) as { result: unknown }).result;
}

export function useChainTicker(): ChainTicker {
  const [data, setData] = useState<ChainTicker>(INITIAL);
  const samplesRef = useRef<{ height: number; timestamp: number }[]>([]);
  const versionRef = useRef<string | null>(null);

  useEffect(() => {
    const network = currentNetwork();
    let live = true;

    const tick = async () => {
      if (!live || document.hidden) return;

      const [nodeHealth, nodeHeader, indexerBlock, proofOk] = await Promise.all([
        rpc(network.node, 'system_health').catch(() => null),
        rpc(network.node, 'chain_getHeader').catch(() => null),
        fetch(network.indexer, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: '{ block { height hash timestamp } }' }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => (j as { data?: { block?: { height: number; hash: string; timestamp: number } } })?.data?.block ?? null)
          .catch(() => null),
        fetch(network.proofServerConfig.url).then((r) => r.ok).catch(() => false),
      ]);

      if (versionRef.current === null && nodeHealth) {
        versionRef.current = String((await rpc(network.node, 'system_version').catch(() => '')) || '') || null;
      }

      if (!live) return;

      if (indexerBlock) {
        const samples = samplesRef.current;
        const last = samples[samples.length - 1];
        if (!last || indexerBlock.height > last.height) {
          samples.push({ height: indexerBlock.height, timestamp: indexerBlock.timestamp });
          if (samples.length > 8) samples.shift();
        }
      }
      const samples = samplesRef.current;
      const first = samples[0];
      const last = samples[samples.length - 1];
      const blockSeconds =
        first && last && last.height > first.height
          ? (last.timestamp - first.timestamp) / (last.height - first.height) / 1000
          : null;

      const health = nodeHealth as { peers: number; isSyncing: boolean } | null;
      const header = nodeHeader as { number: string } | null;
      setData({
        nodeOk: nodeHealth !== null,
        indexerOk: indexerBlock !== null,
        proofOk,
        nodeHeight: header ? parseInt(header.number, 16) : null,
        indexerHeight: indexerBlock?.height ?? null,
        blockHash: indexerBlock?.hash ?? null,
        blockAgeMs: indexerBlock ? Date.now() - indexerBlock.timestamp : null,
        blockSeconds,
        peers: health?.peers ?? null,
        syncing: health?.isSyncing ?? null,
        nodeVersion: versionRef.current,
      });
    };

    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  return data;
}
