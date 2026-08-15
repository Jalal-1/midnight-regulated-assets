/**
 * Lab: the PUBLIC account-based contract token — the transparency baseline.
 *
 * Guided walkthrough wrapper around a REAL console: every button is a proved
 * transaction on the connected chain, every value in the public view is
 * decoded from real indexer state, and the closing sections say exactly what
 * stayed public (everything) and what that means for the deposit use case.
 */

import { useCallback, useEffect, useState } from 'react';

import { getModel } from '@mra/asset-models';
import {
  Infrastructure,
  LabLayout,
  LabSection,
  Link,
  OpBar,
  StatusBadge,
  useOps,
  VisibilityMatrix,
  currentNetwork,
} from '@mra/lab-shell';
import { formatDust, formatNight } from '@mra/wallet';

import { getGenesisHash } from '../history.ts';
import {
  burn,
  connectPersona,
  deployToken,
  hex,
  mint,
  readPublicView,
  tokenIdentities,
  transfer,
  type PublicView,
  type TokenSession,
} from './publicToken.ts';
import FaucetSetup from './FaucetSetup.tsx';
import StagenetSeeds from './StagenetSeeds.tsx';
import {
  forgetToken,
  loadCheckedTokens,
  rememberToken,
  type CheckedToken,
} from './tokenHistory.ts';

/** Fixed demo amounts, in cents — mirrors the Node reference script. */
const ISSUE = 100_000n;
const PAY = 25_000n;
const REDEEM = 50_000n;

const fmtWith = (units: bigint, symbol: string, decimals = 2) =>
  `${(Number(units) / 10 ** decimals).toFixed(decimals)} ${symbol}`.trim();

const short = (value: string, head = 10, tail = 6) => `${value.slice(0, head)}…${value.slice(-tail)}`;

const STATE_LABEL = { live: 'live', 'not-found': 'no state', 'other-chain': 'previous chain' } as const;

const normSeed = (raw: string) => raw.trim().toLowerCase().replace(/^0x/, '');
const isSeed = (raw: string) => /^[0-9a-f]{64}$/.test(raw);

const age = (at: number, now: number) => {
  const seconds = Math.round((now - at) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86_400)}d ago`;
};

export default function PublicTokenLab() {
  const model = getModel('public-account-token')!;
  const ops = useOps();
  const [sessions, setSessions] = useState<{ acme?: TokenSession; alice?: TokenSession }>({});
  const [tokens, setTokens] = useState<readonly CheckedToken[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [view, setView] = useState<PublicView | null>(null);
  const [ids, setIds] = useState<Awaited<ReturnType<typeof tokenIdentities>> | null>(null);
  const [genesis, setGenesis] = useState<string | null>(null);
  const [tokenName, setTokenName] = useState('ACME Deposit Token');
  const [tokenSymbol, setTokenSymbol] = useState('aUSD');
  const [seedAcme, setSeedAcme] = useState('');
  const [seedAlice, setSeedAlice] = useState('');

  const network = currentNetwork();
  const isLocalnet = network.networkId === 'undeployed';

  useEffect(() => {
    document.title = 'Public contract token — lab';
  }, []);

  const refreshTokens = useCallback(async () => {
    const next = await loadCheckedTokens();
    setTokens(next);
    setActive((current) => current ?? next.find((t) => t.state === 'live')?.address ?? null);
    try {
      setGenesis(await getGenesisHash());
    } catch {
      setGenesis(null);
    }
  }, []);

  useEffect(() => {
    if (isLocalnet) void tokenIdentities().then(setIds);
    void refreshTokens();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, [refreshTokens]);

  const refreshView = useCallback(async (at: string | null) => {
    if (!at) {
      setView(null);
      return;
    }
    try {
      setView(await readPublicView(at));
    } catch {
      setView(null);
    }
  }, []);

  useEffect(() => {
    void refreshView(active);
    const timer = setInterval(() => void refreshView(active), 5000);
    return () => clearInterval(timer);
  }, [active, refreshView]);

  const onConnect = async () => {
    let seeds: { acme: string; alice: string } | undefined;
    if (!isLocalnet) {
      seeds = { acme: normSeed(seedAcme), alice: normSeed(seedAlice) };
      if (!isSeed(seeds.acme) || !isSeed(seeds.alice)) {
        ops.say(
          'Stagenet needs TWO 64-hex faucet-funded seeds (ACME Bank and Alice) — fund them at faucet.stagenet.shielded.tools',
          'error',
        );
        return;
      }
      setIds(await tokenIdentities(seeds));
    }
    ops.setStatus('connecting');
    const acme = await ops.step('Create wallet for ACME Bank (build + sync)', () =>
      connectPersona('acme', seeds?.acme, (m) => ops.say(`  ↳ ${m}`)),
    );
    if (!acme) return;
    setSessions((prev) => ({ ...prev, acme }));
    const alice = await ops.step('Create wallet for Alice (build + sync)', () =>
      connectPersona('alice', seeds?.alice, (m) => ops.say(`  ↳ ${m}`)),
    );
    if (!alice) return;
    setSessions((prev) => ({ ...prev, alice }));
    ops.say(
      `ACME Bank: ${formatNight(acme.unshieldedBalance)} NIGHT · ${formatDust(acme.dustBalance(new Date()))} DUST — fees are paid in DUST`,
      'ok',
    );
    ops.say('Bob and Eve need no wallet — a recipient is an account id; a reader needs nothing', 'ok');
    ops.setStatus('ready');
  };

  const onDeploy = async () => {
    if (!sessions.acme) return;
    ops.setStatus('working');
    const naming = {
      name: tokenName.trim() || 'ACME Deposit Token',
      symbol: tokenSymbol.trim() || 'aUSD',
    };
    const deployed = await ops.trackOp('Deploy token', () =>
      ops.step(`Deploy "${naming.name}" (${naming.symbol}, ACME Bank is owner)`, () =>
        deployToken(sessions.acme!, naming),
      ),
    );
    if (!deployed) {
      ops.endOp();
      return;
    }
    setActive(deployed);
    try {
      rememberToken(deployed, await getGenesisHash());
    } catch {
      ops.say('could not record token in history', 'error');
    }
    ops.opReadingBack();
    await ops.step('Read public view (indexer)', () => refreshView(deployed));
    await refreshTokens();
    ops.endOp();
    ops.setStatus('ready');
  };

  const lifecycle = useCallback(
    async (
      at: string,
      label: string,
      fn: () => Promise<{ txId: string; blockHeight: number }>,
    ): Promise<void> => {
      setActive(at);
      ops.setStatus('working');
      const result = await ops.trackOp(label, () => ops.step(label, fn));
      if (result === undefined) {
        ops.endOp();
        return;
      }
      ops.say(`tx ${result.txId.slice(0, 18)}… @ block ${result.blockHeight}`, 'ok');
      ops.opReadingBack();
      await ops.step('Read public view (indexer)', () => refreshView(at));
      await refreshTokens();
      ops.endOp();
      ops.setStatus('ready');
    },
    [ops, refreshTokens, refreshView],
  );

  const onForget = (target: string) => {
    forgetToken(target);
    if (target === active) {
      setActive(null);
      setView(null);
    }
    void refreshTokens();
  };

  const label = (account: Uint8Array): string => {
    if (!ids) return `${hex(account).slice(0, 8)}…`;
    const h = hex(account);
    if (h === hex(ids.ids.alice.left)) return 'Alice';
    if (h === hex(ids.ids.bob.left)) return 'Bob';
    if (h === hex(ids.ids.acme.left)) return 'ACME Bank';
    return `${h.slice(0, 8)}…`;
  };

  const ready = !!sessions.acme && !!sessions.alice;
  const busy = ops.busy;
  const liveCount = tokens.filter((t) => t.state === 'live').length;
  const staleCount = tokens.length - liveCount;
  const symbol = view?.symbol ?? (tokenSymbol.trim() || 'aUSD');
  const decimals = view?.decimals ?? 2;
  const fmt = (units: bigint) => fmtWith(units, symbol, decimals);

  return (
    <LabLayout model={model} chainId={genesis}>
      <LabSection n="01" title="Asset and use case">
        <p>
          A deposit-style token as it would look on a fully transparent chain: an owner-controlled
          fungible token in public contract state. This is the <strong>baseline</strong> the
          confidential model is measured against — run the lifecycle here, watch what the world
          sees, then run the{' '}
          <Link to="/labs/confidential-token" className="inline-link">
            confidential lab
          </Link>{' '}
          and compare.
        </p>
      </LabSection>

      <LabSection n="02" title="Participants">
        <ul>
          <li><strong>ACME Bank</strong> — issuer; deploys the token and controls mint and burn</li>
          <li><strong>Alice</strong> — customer; receives issuance, makes a payment</li>
          <li><strong>Bob</strong> — customer; receives Alice&apos;s payment. Needs no wallet here: a recipient is just an account id</li>
          <li><strong>Eve</strong> — public observer; no wallet, no keys — and, on this model, misses nothing</li>
          <li><strong>Regulator</strong> — no differentiated mechanism exists or is needed: the public view IS the full view</li>
        </ul>
      </LabSection>

      <LabSection n="03" title="Disclosure profile">
        <VisibilityMatrix model={model} />
      </LabSection>

      <LabSection n="04" title="Custody and authorisation">
        <p>{model.authorisationModel}</p>
        <p className="muted">
          Custody status, stated precisely: HSM <StatusBadge status={model.custody.hsm.status} /> ·
          MPC <StatusBadge status={model.custody.mpc.status} /> · multisig{' '}
          <StatusBadge status={model.custody.multisig.status} /> · threshold policy{' '}
          <StatusBadge status={model.custody.thresholdPolicy.status} />. {model.custody.multisig.note}
        </p>
      </LabSection>

      <LabSection n="05–10" title="The live console">
        <p className="muted small">
          Steps 05–10 run here: create wallets → deploy (issue on deploy is not automatic — name
          the token first) → issue 1,000.00 → transfer 250.00 → redeem 500.00, then inspect each
          participant&apos;s view. Every operation takes ~18s: proving is ~0.3s on this machine,
          block inclusion is the rest — the operation bar shows the measured split.
        </p>

        <div className="lab-console">
          <div className="columns">
            <div className="col">
              <section className="grid">
                <div className="card">
                  <span className="label">Supply</span>
                  <span className="value">{view ? fmt(view.totalSupply) : '—'}</span>
                </div>
                <div
                  className={active ? 'card copyable' : 'card'}
                  title={active ? `${active} — click to copy` : 'No token selected'}
                  onClick={() => {
                    if (active) {
                      try {
                        void navigator.clipboard.writeText(active);
                        ops.say('token address copied');
                      } catch {
                        /* clipboard unavailable */
                      }
                    }
                  }}
                >
                  <span className="label">{view ? `Token — ${view.symbol}` : 'Token'}</span>
                  <span className="value small">{active ? short(active) : 'not deployed'}</span>
                </div>
                <div
                  className="card"
                  title="NIGHT is Midnight's native token; DUST pays transaction fees and is generated by holding NIGHT."
                >
                  <span className="label">Issuer — ACME Bank</span>
                  <span className="value small">
                    {sessions.acme
                      ? `${formatNight(sessions.acme.unshieldedBalance)} NIGHT · ${formatDust(
                          sessions.acme.dustBalance(new Date(ops.now)),
                        )} DUST`
                      : 'not created'}
                  </span>
                </div>
              </section>

              {!isLocalnet && (
                <section className="naming">
                  <StagenetSeeds
                    disabled={busy || ready}
                    say={ops.say}
                    fields={[
                      { key: 'acme', label: 'ACME Bank seed (issuer)', value: seedAcme, onChange: setSeedAcme },
                      { key: 'alice', label: 'Alice seed (customer)', value: seedAlice, onChange: setSeedAlice },
                    ]}
                  />
                  {sessions.acme && (
                    <FaucetSetup
                      label="ACME Bank"
                      wallet={sessions.acme.wallet}
                      address={sessions.acme.unshieldedAddress}
                      say={ops.say}
                    />
                  )}
                  {sessions.alice && (
                    <FaucetSetup
                      label="Alice"
                      wallet={sessions.alice.wallet}
                      address={sessions.alice.unshieldedAddress}
                      say={ops.say}
                    />
                  )}
                </section>
              )}

              <section className="naming">
                <label>
                  <span className="label">Token name</span>
                  <input
                    value={tokenName}
                    onChange={(e) => setTokenName(e.target.value)}
                    disabled={busy}
                    maxLength={48}
                    placeholder="ACME Deposit Token"
                  />
                </label>
                <label>
                  <span className="label">Symbol</span>
                  <input
                    className="mono"
                    value={tokenSymbol}
                    onChange={(e) => setTokenSymbol(e.target.value)}
                    disabled={busy}
                    maxLength={12}
                    placeholder="aUSD"
                  />
                </label>
                <button
                  className={ready ? 'secondary' : 'primary'}
                  onClick={onConnect}
                  disabled={busy || ready}
                >
                  {ready ? 'Wallets ready' : '1 · Create wallets'}
                </button>
                <button
                  className={ready ? 'primary' : 'secondary'}
                  onClick={onDeploy}
                  disabled={busy || !ready}
                >
                  2 · Deploy token
                </button>
              </section>

              <section className="contracts">
                <div className="contracts-head">
                  <h2 title="Each card is a deployed contract on the chain, with its own commands">
                    Token instances
                  </h2>
                  <span className="muted small">
                    {tokens.length === 0
                      ? 'none yet'
                      : `${liveCount} live${staleCount > 0 ? ` · ${staleCount} stale` : ''}`}
                  </span>
                  <button className="link" onClick={() => void refreshTokens()} disabled={busy}>
                    refresh
                  </button>
                </div>

                {tokens.length === 0 ? (
                  <p className="muted small contracts-empty">
                    Deploy a token and it appears here as an instance carrying its own commands.
                  </p>
                ) : (
                  <ul className="token-list">
                    {tokens.map((token) => {
                      const isActive = token.address === active;
                      const selectable = token.state !== 'other-chain';
                      const sym = token.view?.symbol ?? '—';
                      const canAct = token.state === 'live' && ready && !busy && !!ids;
                      return (
                        <li key={token.address} className={isActive ? 'active' : undefined}>
                          <div className="token-row">
                            <button
                              className="token-head"
                              onClick={() => selectable && setActive(token.address)}
                              disabled={!selectable || busy}
                              title={token.address}
                            >
                              <strong>{sym}</strong>
                              <span className="muted token-name">{token.view?.name ?? ''}</span>
                              <span className={`badge ${token.state}`}>{STATE_LABEL[token.state]}</span>
                              <span className="mono muted small">{short(token.address, 8, 6)}</span>
                              <span className="muted small token-supply">
                                {token.view
                                  ? `supply ${fmtWith(token.view.totalSupply, token.view.symbol, token.view.decimals)}`
                                  : '—'}
                              </span>
                              <span className="muted small">{age(token.deployedAt, ops.now)}</span>
                            </button>
                            <button
                              className="link forget"
                              onClick={() => onForget(token.address)}
                              disabled={busy}
                              title="Remove from this list (does not affect the chain)"
                              aria-label={`Forget ${token.address}`}
                            >
                              ×
                            </button>
                          </div>
                          {token.state === 'live' && (
                            <div className="token-actions">
                              <button
                                disabled={!canAct}
                                onClick={() =>
                                  void lifecycle(
                                    token.address,
                                    `issue: mint ${fmtWith(ISSUE, sym)} to Alice`,
                                    () => mint(sessions.acme!, token.address, ids!.ids.alice, ISSUE),
                                  )
                                }
                              >
                                Issue {fmtWith(ISSUE, sym)} → Alice
                              </button>
                              <button
                                disabled={!canAct}
                                onClick={() =>
                                  void lifecycle(
                                    token.address,
                                    `transfer: Alice pays Bob ${fmtWith(PAY, sym)}`,
                                    () => transfer(sessions.alice!, token.address, ids!.ids.bob, PAY),
                                  )
                                }
                              >
                                Alice pays Bob {fmtWith(PAY, sym)}
                              </button>
                              <button
                                disabled={!canAct}
                                onClick={() =>
                                  void lifecycle(
                                    token.address,
                                    `redeem: burn ${fmtWith(REDEEM, sym)} from Alice`,
                                    () => burn(sessions.acme!, token.address, ids!.ids.alice, REDEEM),
                                  )
                                }
                              >
                                Redeem {fmtWith(REDEEM, sym)} ← Alice
                              </button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {staleCount > 0 && (
                  <p className="note">
                    Stale entries are kept deliberately: a localnet restart creates a new chain, so
                    tokens from an earlier run still exist in this browser but not on the chain.
                  </p>
                )}
              </section>

              <OpBar op={ops.op} lastTiming={ops.lastTiming} now={ops.now} />

              <section className="log" aria-live="polite" ref={ops.logBox}>
                {ops.log.length === 0 && (
                  <p className="muted">
                    Create wallets, deploy, then use the commands on a token instance. Issuing and
                    redeeming are ACME Bank–only; the transfer is signed by Alice.
                  </p>
                )}
                {ops.log.map((line, i) => (
                  <p key={i} className={line.kind}>
                    <span>{line.text}</span>
                    {line.ms !== undefined && <span className="ms">{(line.ms / 1000).toFixed(1)}s</span>}
                  </p>
                ))}
                {busy && <p className="working">working — proving takes ~20s, do not reload</p>}
              </section>
            </div>

            <div className="col">
              <section className="public-view">
                <div className="public-view-head">
                  <h2>Public view — what Eve sees</h2>
                  <span className="muted small">no wallet · no keys · live indexer state</span>
                </div>

                {!active ? (
                  <p className="muted small">
                    Deploy or select a token and this panel fills itself — from nothing but the
                    indexer.
                  </p>
                ) : !view ? (
                  <p className="muted small">reading contract state…</p>
                ) : (
                  <>
                    <table className="holders">
                      <thead>
                        <tr>
                          <th>holder</th>
                          <th>account id</th>
                          <th className="num">balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {view.holdings.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="muted">
                              no holders yet — issue some deposits
                            </td>
                          </tr>
                        ) : (
                          view.holdings.map((h) => (
                            <tr key={hex(h.account)}>
                              <td>{label(h.account)}</td>
                              <td className="mono">{hex(h.account).slice(0, 16)}…</td>
                              <td className="num mono">{fmt(h.balance)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                    <div className="public-facts">
                      <div className="row">
                        <span className="k">token</span>
                        <span className="v">
                          {view.name} ({view.symbol})
                        </span>
                      </div>
                      <div className="row">
                        <span className="k">total supply</span>
                        <span className="v">{fmt(view.totalSupply)}</span>
                      </div>
                      <div className="row">
                        <span className="k">owner</span>
                        <span className="v mono">
                          {hex(view.owner).slice(0, 16)}… ({label(view.owner)})
                        </span>
                      </div>
                    </div>
                  </>
                )}

                <p className="note">
                  Eve did not query balances she knew about — she <strong>enumerated the map</strong>.
                  Names beside the ids are this page&apos;s labels for the demo cast; the chain
                  shows the ids to everyone. On this composition the public sees what the
                  regulator sees, holder list included.
                </p>
              </section>

              <Infrastructure />
            </div>
          </div>
        </div>
      </LabSection>

      <LabSection n="11" title="What remained public, what remained private">
        <p>
          <strong>Public: everything.</strong> Every balance, every transfer amount, every
          counterparty pair, the total supply, and the owner — enumerable by anyone with an
          indexer connection, no wallet or key required. <strong>Private: nothing.</strong> That
          is not a flaw in the implementation; it is the property this model demonstrates, and
          the reason it fails a deposit&apos;s privacy requirement by construction.
        </p>
      </LabSection>

      <LabSection n="12" title="Production and custody considerations">
        <ul>
          <li>{model.custody.integration.note}</li>
          <li>
            Issuer control is a single witness secret behind <span className="mono">Ownable</span>{' '}
            — a threshold policy (e.g. 2-of-3) would come from composing the OpenZeppelin multisig
            modules, which this example has not done.
          </li>
          <li>
            {model.standards.implementation}. {model.standards.auditStatus}
          </li>
          <li>Verification status: {model.verification} — not yet run on Stagenet.</li>
        </ul>
      </LabSection>

      <LabSection n="13" title="Source and build">
        <ul>
          {model.source.map((s) => (
            <li key={s} className="mono small">
              {s}
            </li>
          ))}
          <li>
            Node reference script:{' '}
            <span className="mono small">
              yarn workspace @mra/app-tokenised-deposit design-options:public
            </span>
          </li>
          <li>
            <Link to="/build" className="inline-link">
              Build section: prerequisites, toolchain, localnet →
            </Link>
          </li>
        </ul>
      </LabSection>
    </LabLayout>
  );
}
