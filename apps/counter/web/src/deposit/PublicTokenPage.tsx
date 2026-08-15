/**
 * Unshielded Contract Token — tokenised-deposit design option 1, clickable.
 *
 * Deploy mints CONTRACT INSTANCES, and the instances are the interface: each
 * deployed token is a card carrying its own commands (issue / transfer /
 * redeem), which always act on that card's address. Selecting a card points
 * the tiles and the public view at it. Tokens from a previous chain are shown
 * but disabled — same honesty rules as the counter's history.
 *
 * Every action is a real proved transaction; every displayed value — including
 * each card's name, symbol, and supply — is read back from chain state.
 */

import { useCallback, useEffect, useState } from 'react';


import { currentNetwork } from '../network.ts';
import { formatDust, formatNight } from '@mra/wallet';

import { getGenesisHash } from '../history.ts';
import Infrastructure from '../Infrastructure.tsx';
import LogoMark from '../Logo.tsx';
import NetPill from '../NetPill.tsx';
import { OpBar, useOps } from '../ops.tsx';
import { Link } from '../router.tsx';
import { useTheme } from '../theme.ts';
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

export default function PublicTokenPage() {
  const ops = useOps();
  const [theme, toggleTheme] = useTheme();
  const [sessions, setSessions] = useState<{ meridian?: TokenSession; alice?: TokenSession }>({});
  const [tokens, setTokens] = useState<readonly CheckedToken[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [view, setView] = useState<PublicView | null>(null);
  const [ids, setIds] = useState<Awaited<ReturnType<typeof tokenIdentities>> | null>(null);
  const [genesis, setGenesis] = useState<string | null>(null);
  const [logsOn, setLogsOn] = useState(false);
  const [tokenName, setTokenName] = useState('Meridian Deposit Token');
  const [tokenSymbol, setTokenSymbol] = useState('mUSD');
  // Stagenet only: faucet-funded seeds, memory only, never persisted.
  const [seedMeridian, setSeedMeridian] = useState('');
  const [seedAlice, setSeedAlice] = useState('');

  const network = currentNetwork();
  const isLocalnet = network.networkId === 'undeployed';

  useEffect(() => {
    document.title = 'Unshielded Contract Token';
  }, []);

  /** Re-check remembered tokens against the chain; auto-select the newest live one. */
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

  /** The public view follows the ACTIVE token, polled so outside changes appear. */
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
    let seeds: { meridian: string; alice: string } | undefined;
    if (!isLocalnet) {
      seeds = { meridian: normSeed(seedMeridian), alice: normSeed(seedAlice) };
      if (!isSeed(seeds.meridian) || !isSeed(seeds.alice)) {
        ops.say(
          'Stagenet needs TWO 64-hex faucet-funded seeds (Meridian and Alice) — fund them at faucet.stagenet.shielded.tools',
          'error',
        );
        return;
      }
      setIds(await tokenIdentities(seeds));
    }
    ops.setStatus('connecting');
    const meridian = await ops.step('Create wallet for Meridian (build + sync)', () =>
      connectPersona('meridian', seeds?.meridian),
    );
    if (!meridian) return;
    setSessions((prev) => ({ ...prev, meridian }));
    const alice = await ops.step('Create wallet for Alice (build + sync)', () =>
      connectPersona('alice', seeds?.alice),
    );
    if (!alice) return;
    setSessions((prev) => ({ ...prev, alice }));
    ops.say(
      `Meridian: ${formatNight(meridian.unshieldedBalance)} NIGHT · ${formatDust(meridian.dustBalance(new Date()))} DUST — fees are paid in DUST`,
      'ok',
    );
    ops.say('Bob and Eve need no wallet — a recipient is an account id; a reader needs nothing', 'ok');
    ops.setStatus('ready');
  };

  const onDeploy = async () => {
    if (!sessions.meridian) return;
    ops.setStatus('working');
    const naming = {
      name: tokenName.trim() || 'Meridian Deposit Token',
      symbol: tokenSymbol.trim() || 'mUSD',
    };
    const deployed = await ops.trackOp('Deploy token', () =>
      ops.step(`Deploy "${naming.name}" (${naming.symbol}, Meridian is owner)`, () =>
        deployToken(sessions.meridian!, naming),
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

  /** Run one proved call against a SPECIFIC token instance, then re-read it. */
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
    if (h === hex(ids.ids.meridian.left)) return 'Meridian';
    return `${h.slice(0, 8)}…`;
  };

  const ready = !!sessions.meridian && !!sessions.alice;
  const busy = ops.busy;
  const liveCount = tokens.filter((t) => t.state === 'live').length;
  const staleCount = tokens.length - liveCount;
  const symbol = view?.symbol ?? (tokenSymbol.trim() || 'mUSD');
  const decimals = view?.decimals ?? 2;
  const fmt = (units: bigint) => fmtWith(units, symbol, decimals);

  return (
    <main>
      <header className="topbar">
        <Link to="/" className="brand-home" aria-label="Home">
          <LogoMark className="brand-logo" />
        </Link>
        <div className="brand-text">
          <h1>Unshielded Contract Token</h1>
          <p className="brand-sub">
            Tokenised-deposit design option 1 — owner-controlled, account-based, fully public.
            Each deployed instance carries its own commands; the public view is what anyone can
            see.
          </p>
        </div>
        <div className="topbar-right">
          <NetPill chainId={genesis} />
          <span className="logs-indicator">{logsOn ? 'logs streaming' : 'logs off'}</span>
          <button className="theme-btn" onClick={toggleTheme}>
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
      </header>

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
              <span className="value small">{active ? short(active) : 'none selected'}</span>
            </div>
            <div
              className="card"
              title="NIGHT is Midnight's native token; DUST pays transaction fees and is generated by holding NIGHT."
            >
              <span className="label">Issuer — Meridian</span>
              <span className="value small">
                {sessions.meridian
                  ? `${formatNight(sessions.meridian.unshieldedBalance)} NIGHT · ${formatDust(
                      sessions.meridian.dustBalance(new Date(ops.now)),
                    )} DUST`
                  : 'not created'}
              </span>
            </div>
          </section>

          {!isLocalnet && (
            <section className="naming">
              <label>
                <span className="label">Meridian seed (issuer)</span>
                <input
                  className="mono seed-input"
                  type="password"
                  value={seedMeridian}
                  onChange={(e) => setSeedMeridian(e.target.value)}
                  disabled={busy || ready}
                  placeholder="64 hex · faucet-funded"
                />
              </label>
              <label>
                <span className="label">Alice seed (customer)</span>
                <input
                  className="mono seed-input"
                  type="password"
                  value={seedAlice}
                  onChange={(e) => setSeedAlice(e.target.value)}
                  disabled={busy || ready}
                  placeholder="64 hex · faucet-funded"
                />
              </label>
              <span className="muted small naming-note">memory only — never persisted</span>
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
                placeholder="Meridian Deposit Token"
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
                placeholder="mUSD"
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
                                () => mint(sessions.meridian!, token.address, ids!.ids.alice, ISSUE),
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
                                () => burn(sessions.meridian!, token.address, ids!.ids.alice, REDEEM),
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
              <div className="guide">
                <p className="muted">
                  <strong>New here?</strong> This page issues a bank-style token on Midnight, live:
                </p>
                <p className="muted">1 · Create wallets — Meridian is the issuing bank, Alice a customer. Both are funded with NIGHT by the local chain; fees are paid in DUST.</p>
                <p className="muted">2 · Deploy token — name it first. Each deploy is a real contract; it appears below as an instance with its own commands.</p>
                <p className="muted">3 · Use an instance&apos;s commands — issue to Alice, let Alice pay Bob, redeem. Each is a proved transaction (~18s, mostly waiting for a block).</p>
                <p className="muted">Watch the right panel while you do: Eve sees every holder and every balance without a wallet or a key. That transparency is what this design option demonstrates.</p>
              </div>
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
              Names beside the ids are this page&apos;s labels for the demo cast; the chain shows
              the ids to everyone. On this composition the public sees what the regulator sees,
              holder list included. That is the checklist failure the confidential options exist
              to fix.
            </p>
          </section>

          <Infrastructure onLogsState={setLogsOn} />
        </div>
      </div>

      <footer>
        <LogoMark className="brand-logo" />
        <p>
          Every action on this page is a real proved transaction on the local chain; every value
          in the public view is decoded from real indexer state. Nothing is simulated.{' '}
          {isLocalnet && 'This local chain’s wallets use well-known public test seeds, never funded keys.'}
        </p>
      </footer>
    </main>
  );
}
