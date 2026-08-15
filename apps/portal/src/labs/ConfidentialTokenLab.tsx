/**
 * Lab: the CONFIDENTIAL account-based contract token — the working CFT
 * lifecycle, in the browser, on the real stack.
 *
 * Everything here is real: wallets built in the page, proofs from the local
 * proof server, state decoded from the indexer. Eve's panel shows exactly what
 * the chain serves (public supply, account ids, ciphertexts); the wallet-side
 * panel shows the plaintext ONLY this page's sessions know — kept in memory,
 * never persisted, and verified by every proof the circuits accept.
 *
 * Instances deployed in an earlier page session are shown read-only: their
 * wallet-side plaintext tracking lived in that session's memory (by design —
 * it is the private data this model protects). Deploy a fresh instance to run
 * the lifecycle.
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
  connectCftPersona,
  deployCft,
  hex,
  mintCft,
  readCftView,
  redeemCft,
  registerCft,
  sweepCft,
  transferCft,
  type CftSession,
  type CftView,
} from './confidentialToken.ts';
import { forgetCft, loadCheckedCfts, rememberCft, type CheckedCft } from './cftHistory.ts';

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

type Sessions = { acme?: CftSession; alice?: CftSession; bob?: CftSession };

export default function ConfidentialTokenLab() {
  const model = getModel('confidential-account-token')!;
  const ops = useOps();
  const [sessions, setSessions] = useState<Sessions>({});
  const [instances, setInstances] = useState<readonly CheckedCft[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [view, setView] = useState<CftView | null>(null);
  const [genesis, setGenesis] = useState<string | null>(null);
  const [sessionDeployed, setSessionDeployed] = useState<readonly string[]>([]);
  const [tokenName, setTokenName] = useState('ACME Confidential Deposit');
  const [tokenSymbol, setTokenSymbol] = useState('caUSD');
  const [seeds, setSeeds] = useState({ acme: '', alice: '', bob: '' });

  const network = currentNetwork();
  const isLocalnet = network.networkId === 'undeployed';

  useEffect(() => {
    document.title = 'Confidential contract token — lab';
  }, []);

  const refreshInstances = useCallback(async () => {
    const next = await loadCheckedCfts();
    setInstances(next);
    setActive((current) => current ?? next.find((t) => t.state === 'live')?.address ?? null);
    try {
      setGenesis(await getGenesisHash());
    } catch {
      setGenesis(null);
    }
  }, []);

  useEffect(() => {
    void refreshInstances();
  }, [refreshInstances]);

  const refreshView = useCallback(async (at: string | null) => {
    if (!at) {
      setView(null);
      return;
    }
    try {
      setView(await readCftView(at));
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
    let typed: { acme: string; alice: string; bob: string } | undefined;
    if (!isLocalnet) {
      typed = { acme: normSeed(seeds.acme), alice: normSeed(seeds.alice), bob: normSeed(seeds.bob) };
      if (!isSeed(typed.acme) || !isSeed(typed.alice) || !isSeed(typed.bob)) {
        ops.say(
          'Stagenet needs THREE 64-hex faucet-funded seeds — on this model even recipients need funded wallets, because registering an encryption key is a transaction',
          'error',
        );
        return;
      }
    }
    ops.setStatus('connecting');
    for (const persona of ['acme', 'alice', 'bob'] as const) {
      const label = persona === 'acme' ? 'ACME Bank' : persona === 'alice' ? 'Alice' : 'Bob';
      const session = await ops.step(`Create wallet for ${label} (build + sync)`, () =>
        connectCftPersona(persona, typed?.[persona]),
      );
      if (!session) return;
      setSessions((prev) => ({ ...prev, [persona]: session }));
      if (persona === 'acme') {
        ops.say(
          `ACME Bank: ${formatNight(session.unshieldedBalance)} NIGHT · ${formatDust(session.dustBalance(new Date()))} DUST — fees are paid in DUST`,
          'ok',
        );
      }
    }
    ops.say('Eve still needs nothing — her panel reads the indexer without a wallet or key', 'ok');
    ops.setStatus('ready');
  };

  const onDeploy = async () => {
    if (!sessions.acme) return;
    ops.setStatus('working');
    const naming = {
      name: tokenName.trim() || 'ACME Confidential Deposit',
      symbol: tokenSymbol.trim() || 'caUSD',
    };
    const deployed = await ops.trackOp('Deploy token', () =>
      ops.step(`Deploy "${naming.name}" (${naming.symbol}, ACME Bank is owner)`, () =>
        deployCft(sessions.acme!, naming),
      ),
    );
    if (!deployed) {
      ops.endOp();
      return;
    }
    setActive(deployed);
    setSessionDeployed((prev) => [...prev, deployed]);
    try {
      rememberCft(deployed, await getGenesisHash());
    } catch {
      ops.say('could not record instance in history', 'error');
    }
    ops.opReadingBack();
    await ops.step("Read Eve's view (indexer)", () => refreshView(deployed));
    await refreshInstances();
    ops.endOp();
    ops.setStatus('ready');
  };

  const lifecycle = useCallback(
    async (at: string, label: string, fn: () => Promise<{ txId: string; blockHeight: number }>) => {
      setActive(at);
      ops.setStatus('working');
      const result = await ops.trackOp(label, () => ops.step(label, fn));
      if (result === undefined) {
        ops.endOp();
        return;
      }
      ops.say(`tx ${result.txId.slice(0, 18)}… @ block ${result.blockHeight}`, 'ok');
      ops.opReadingBack();
      await ops.step("Read Eve's view (indexer)", () => refreshView(at));
      await refreshInstances();
      ops.endOp();
      ops.setStatus('ready');
    },
    [ops, refreshInstances, refreshView],
  );

  const onForget = (target: string) => {
    forgetCft(target);
    if (target === active) {
      setActive(null);
      setView(null);
    }
    void refreshInstances();
  };

  const ready = !!sessions.acme && !!sessions.alice && !!sessions.bob;
  const busy = ops.busy;
  const liveCount = instances.filter((t) => t.state === 'live').length;
  const staleCount = instances.length - liveCount;
  const symbol = view?.symbol ?? (tokenSymbol.trim() || 'caUSD');
  const decimals = view?.decimals ?? 2;
  const fmt = (units: bigint) => fmtWith(units, symbol, decimals);

  const label = (account: Uint8Array): string => {
    const h = hex(account);
    for (const persona of ['acme', 'alice', 'bob'] as const) {
      const session = sessions[persona];
      if (session && hex(session.tokenWallet.id) === h) return session.tokenWallet.label;
    }
    return `${h.slice(0, 8)}…`;
  };

  const registeredIds = new Set((view?.registered ?? []).map(hex));
  const aliceRegistered = !!sessions.alice && registeredIds.has(hex(sessions.alice.tokenWallet.id));
  const bobRegistered = !!sessions.bob && registeredIds.has(hex(sessions.bob.tokenWallet.id));

  return (
    <LabLayout model={model} chainId={genesis}>
      <LabSection n="01" title="Asset and use case">
        <p>
          The composition a tokenised deposit actually wants:{' '}
          <strong>balances and transfer amounts encrypted</strong> (ElGamal ciphertexts on chain),
          issuer control retained (owner-gated mint and compliance burn), and{' '}
          <strong>total supply public by design</strong> — a bank attesting 1:1 backing needs an
          attestable circulating supply, which also means each issue/redeem amount is visible as a
          supply delta. Run the{' '}
          <Link to="/labs/public-token" className="inline-link">transparency baseline</Link> first
          if you have not — the contrast is the point.
        </p>
      </LabSection>

      <LabSection n="02" title="Participants">
        <ul>
          <li><strong>ACME Bank</strong> — issuer; deploys, mints, and can compliance-burn</li>
          <li><strong>Alice</strong> — customer; receives issuance, pays Bob, redeems</li>
          <li>
            <strong>Bob</strong> — customer. Unlike the public model, Bob needs a funded wallet
            here: receiving requires a registered encryption key, and registering is a transaction
          </li>
          <li><strong>Eve</strong> — public observer; sees supply, account ids, and ciphertexts — never a plaintext balance</li>
          <li>
            <strong>Regulator</strong> — <StatusBadge status="Not implemented" /> — the pinned
            module has no viewing-key mechanism, so no differentiated regulator view is shown
            anywhere in this lab
          </li>
        </ul>
      </LabSection>

      <LabSection n="03" title="Disclosure profile">
        <VisibilityMatrix model={model} />
      </LabSection>

      <LabSection n="04" title="Custody and authorisation">
        <p>{model.authorisationModel}</p>
        <p>
          <strong>Sensitive material:</strong> {model.keyMaterial}
        </p>
        <p className="muted">
          Custody status, stated precisely: HSM <StatusBadge status={model.custody.hsm.status} /> ·
          MPC <StatusBadge status={model.custody.mpc.status} /> · multisig{' '}
          <StatusBadge status={model.custody.multisig.status} /> · threshold policy{' '}
          <StatusBadge status={model.custody.thresholdPolicy.status} />.{' '}
          {model.custody.integration.note}
        </p>
      </LabSection>

      <LabSection n="05–10" title="The live console">
        <p className="muted small">
          The full lifecycle, every step a real proved transaction: create three wallets → deploy
          → register Alice&apos;s and Bob&apos;s encryption keys → issue 1,000.00 to Alice
          (lands in <em>pending</em>) → Alice sweeps → Alice pays Bob 250.00 with the amount
          hidden → Bob sweeps → Alice redeems 500.00. Expect ~18s per operation — proving is
          ~0.3s even for the heavy transfer circuit; block inclusion is the rest.
        </p>

        <div className="lab-console">
          <div className="columns">
            <div className="col">
              <section className="grid">
                <div className="card">
                  <span className="label">Public supply</span>
                  <span className="value">{view ? fmt(view.totalSupply) : '—'}</span>
                </div>
                <div
                  className={active ? 'card copyable' : 'card'}
                  title={active ? `${active} — click to copy` : 'No instance selected'}
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
                  {(['acme', 'alice', 'bob'] as const).map((who) => (
                    <label key={who}>
                      <span className="label">{who === 'acme' ? 'ACME Bank seed' : `${who} seed`}</span>
                      <input
                        className="mono seed-input"
                        type="password"
                        value={seeds[who]}
                        onChange={(e) => setSeeds((prev) => ({ ...prev, [who]: e.target.value }))}
                        disabled={busy || ready}
                        placeholder="64 hex · faucet-funded"
                      />
                    </label>
                  ))}
                  <span className="muted small naming-note">
                    developer/test entry — memory only, never persisted
                  </span>
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
                    placeholder="ACME Confidential Deposit"
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
                    placeholder="caUSD"
                  />
                </label>
                <button
                  className={ready ? 'secondary' : 'primary'}
                  onClick={onConnect}
                  disabled={busy || ready}
                >
                  {ready ? 'Wallets ready' : '1 · Create wallets (×3)'}
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
                    {instances.length === 0
                      ? 'none yet'
                      : `${liveCount} live${staleCount > 0 ? ` · ${staleCount} stale` : ''}`}
                  </span>
                  <button className="link" onClick={() => void refreshInstances()} disabled={busy}>
                    refresh
                  </button>
                </div>

                {instances.length === 0 ? (
                  <p className="muted small contracts-empty">
                    Deploy a token and it appears here as an instance carrying its lifecycle
                    commands.
                  </p>
                ) : (
                  <ul className="token-list">
                    {instances.map((token) => {
                      const isActive = token.address === active;
                      const selectable = token.state !== 'other-chain';
                      const sym = token.view?.symbol ?? '—';
                      const trackable = sessionDeployed.includes(token.address);
                      const canAct = token.state === 'live' && ready && !busy && trackable;
                      const isViewActive = isActive && view !== null;
                      const alice = sessions.alice?.tokenWallet;
                      const bob = sessions.bob?.tokenWallet;
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
                          {token.state === 'live' && !trackable && (
                            <p className="note instance-note">
                              Read-only: this instance&apos;s wallet-side plaintext lived in the
                              session that deployed it and is deliberately never persisted.
                              Eve&apos;s panel still works; deploy a fresh instance to run the
                              lifecycle.
                            </p>
                          )}
                          {token.state === 'live' && trackable && alice && bob && (
                            <div className="token-actions">
                              {!aliceRegistered && isViewActive && (
                                <button
                                  disabled={!canAct}
                                  onClick={() =>
                                    void lifecycle(token.address, 'register: Alice publishes her encryption key', () =>
                                      registerCft(sessions.alice!, token.address),
                                    )
                                  }
                                >
                                  Register Alice
                                </button>
                              )}
                              {!bobRegistered && isViewActive && (
                                <button
                                  disabled={!canAct}
                                  onClick={() =>
                                    void lifecycle(token.address, 'register: Bob publishes his encryption key', () =>
                                      registerCft(sessions.bob!, token.address),
                                    )
                                  }
                                >
                                  Register Bob
                                </button>
                              )}
                              <button
                                disabled={!canAct || !aliceRegistered}
                                title={aliceRegistered ? undefined : 'Alice must register first'}
                                onClick={() =>
                                  void lifecycle(
                                    token.address,
                                    `issue: mint ${fmtWith(ISSUE, sym)} to Alice (supply delta is public)`,
                                    () => mintCft(sessions.acme!, token.address, alice, ISSUE),
                                  )
                                }
                              >
                                Issue {fmtWith(ISSUE, sym)} → Alice
                              </button>
                              <button
                                disabled={!canAct || alice.pending === 0n}
                                title={alice.pending > 0n ? undefined : 'Nothing pending for Alice'}
                                onClick={() =>
                                  void lifecycle(token.address, 'Alice sweeps pending → spendable', () =>
                                    sweepCft(sessions.alice!, token.address),
                                  )
                                }
                              >
                                Alice sweeps
                              </button>
                              <button
                                disabled={!canAct || !bobRegistered || alice.spendable < PAY}
                                title={
                                  bobRegistered
                                    ? alice.spendable >= PAY
                                      ? undefined
                                      : 'Alice needs a swept balance first'
                                    : 'Bob must register first'
                                }
                                onClick={() =>
                                  void lifecycle(
                                    token.address,
                                    `transfer: Alice pays Bob ${fmtWith(PAY, sym)} — AMOUNT HIDDEN on chain`,
                                    () => transferCft(sessions.alice!, token.address, bob, PAY),
                                  )
                                }
                              >
                                Alice pays Bob {fmtWith(PAY, sym)}
                              </button>
                              <button
                                disabled={!canAct || bob.pending === 0n}
                                title={bob.pending > 0n ? undefined : 'Nothing pending for Bob'}
                                onClick={() =>
                                  void lifecycle(token.address, 'Bob sweeps pending → spendable', () =>
                                    sweepCft(sessions.bob!, token.address),
                                  )
                                }
                              >
                                Bob sweeps
                              </button>
                              <button
                                disabled={!canAct || alice.spendable < REDEEM}
                                title={
                                  alice.spendable >= REDEEM
                                    ? undefined
                                    : 'Alice needs at least the redemption amount spendable'
                                }
                                onClick={() =>
                                  void lifecycle(
                                    token.address,
                                    `redeem: Alice surrenders ${fmtWith(REDEEM, sym)} (supply delta is public)`,
                                    () => redeemCft(sessions.alice!, token.address, REDEEM),
                                  )
                                }
                              >
                                Alice redeems {fmtWith(REDEEM, sym)}
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
                    instances from an earlier run still exist in this browser but not on the chain.
                  </p>
                )}
              </section>

              <OpBar op={ops.op} lastTiming={ops.lastTiming} now={ops.now} />

              <section className="log" aria-live="polite" ref={ops.logBox}>
                {ops.log.length === 0 && (
                  <p className="muted">
                    Create the three wallets, deploy, register Alice and Bob, then walk the
                    lifecycle. Watch Eve&apos;s panel while you do: the supply moves in public;
                    the transfer amount never appears.
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
                    Deploy or select an instance and this panel fills itself — from nothing but
                    the indexer.
                  </p>
                ) : !view ? (
                  <p className="muted small">reading contract state…</p>
                ) : (
                  <>
                    <div className="public-facts">
                      <div className="row">
                        <span className="k">token</span>
                        <span className="v">
                          {view.name} ({view.symbol})
                        </span>
                      </div>
                      <div className="row">
                        <span className="k">total supply — PUBLIC by design</span>
                        <span className="v">{fmt(view.totalSupply)}</span>
                      </div>
                      <div className="row">
                        <span className="k">registered accounts</span>
                        <span className="v">{view.registered.length} (ids + encryption keys public)</span>
                      </div>
                      <div className="row">
                        <span className="k">owner</span>
                        <span className="v mono">
                          {hex(view.owner).slice(0, 16)}… ({label(view.owner)})
                        </span>
                      </div>
                    </div>
                    <table className="holders">
                      <thead>
                        <tr>
                          <th>account</th>
                          <th>balance cell (on chain)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {view.balances.length === 0 ? (
                          <tr>
                            <td colSpan={2} className="muted">
                              no balance cells yet — register and issue
                            </td>
                          </tr>
                        ) : (
                          view.balances.map((cell) => (
                            <tr key={hex(cell.account)}>
                              <td>
                                {label(cell.account)}{' '}
                                <span className="mono muted small">{hex(cell.account).slice(0, 12)}…</span>
                              </td>
                              <td className="mono small">
                                ElGamal ct (c1.x={cell.c1x.slice(0, 12)}…) — not a readable number
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </>
                )}

                <p className="note">
                  Eve fetched every cell above — and can read none of them. What she DOES see:
                  the public supply (including each issue/redeem delta), the registration list,
                  and the (sender, recipient) ids on each transfer. Names beside ids are this
                  page&apos;s labels for the demo cast; the chain shows the ids to everyone.
                </p>
              </section>

              <section className="public-view wallet-side">
                <div className="public-view-head">
                  <h2>Wallet-side plaintext — this session only</h2>
                  <span className="muted small">memory only · never persisted · proof-verified</span>
                </div>
                {ready ? (
                  <table className="holders">
                    <thead>
                      <tr>
                        <th>wallet</th>
                        <th className="num">spendable</th>
                        <th className="num">pending</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(['alice', 'bob'] as const).map((who) => {
                        const w = sessions[who]!.tokenWallet;
                        return (
                          <tr key={who}>
                            <td>{w.label}</td>
                            <td className="num mono">{fmt(w.spendable)}</td>
                            <td className="num mono">{fmt(w.pending)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <p className="muted small">Create the wallets and these numbers appear — for their owners only.</p>
                )}
                <p className="note">
                  These are the numbers the chain never sees. Each wallet knows only its own; every
                  operation PROVES the claimed value decrypts from the on-chain ciphertext
                  (assertDecryptsTo), so wrong tracking fails the proof rather than corrupting
                  state. Eve has no access to this panel&apos;s data — it exists in this
                  page&apos;s memory.
                </p>
              </section>

              <Infrastructure />
            </div>
          </div>
        </div>
      </LabSection>

      <LabSection n="11" title="What remained public, what remained private">
        <ul>
          <li>
            <strong>Public:</strong> the token identity, the total supply and every issue/redeem
            delta, the registration list (account ids + encryption public keys), and the
            (sender, recipient) id pair on each transfer.
          </li>
          <li>
            <strong>Private:</strong> every balance (ciphertext cells) and the transfer amount —
            it never appeared on chain in any form Eve can read.
          </li>
          <li>
            <strong>Wallet-side:</strong> plaintext balances exist only with their owners, and
            every proof the chain accepted verified them against the ciphertexts.
          </li>
        </ul>
      </LabSection>

      <LabSection n="12" title="Production and custody considerations — disclosed in full">
        <ul>
          <li>
            <strong>Dependency:</strong> {model.standards.implementation}
          </li>
          <li>
            <strong>Audit:</strong> {model.standards.auditStatus}
          </li>
          <li>
            <strong>Verification:</strong> {model.verification}. Wallet connectivity is verified
            on Stagenet; this lifecycle has not yet been run there.
          </li>
          <li>
            <strong>Custody:</strong> {model.custody.integration.note}
          </li>
          <li>
            <strong>Wallet obligations the contract cannot enforce:</strong> fresh CSPRNG
            randomness per operation (reuse leaks amount differences — this lab does it
            correctly) and plaintext-balance custody.
          </li>
          {model.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <p>
          Full details on the patch and the compiler issue:{' '}
          <Link to="/standards" className="inline-link">Standards &amp; assurance →</Link>
        </p>
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
              yarn workspace @mra/app-tokenised-deposit design-options:confidential
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
