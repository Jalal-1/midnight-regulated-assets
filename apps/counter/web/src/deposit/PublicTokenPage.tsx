/**
 * Tokenised deposit — design option 1: the PUBLIC contract token, clickable.
 *
 * Left column drives the real lifecycle (deploy → issue → transfer → redeem;
 * every button is a proved transaction on the local chain). Right column is
 * the demonstration: Eve's public view, decoded live from indexer state —
 * the full holder list, enumerated, with no wallet and no keys. On this
 * composition the public sees what the regulator sees. That is the checklist
 * failure the confidential options exist to fix.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { getNetwork } from '@mra/network';

import { getGenesisHash } from '../history.ts';
import Infrastructure from '../Infrastructure.tsx';
import LogoMark from '../Logo.tsx';
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

/** Fixed demo amounts, in cents — mirrors the Node reference script. */
const ISSUE = 100_000n;
const PAY = 25_000n;
const REDEEM = 50_000n;

/** Remember the deployed token, tagged with its chain so a reset is detected. */
const STORAGE_KEY = 'mra.deposit.public-token.v1';

function rememberToken(address: string, genesis: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ address, genesis }));
  } catch {
    /* remembering is a convenience */
  }
}

async function recallToken(): Promise<string | null> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const { address, genesis } = JSON.parse(raw) as { address: string; genesis: string };
    return genesis === (await getGenesisHash()) ? address : null;
  } catch {
    return null;
  }
}

const fmt = (units: bigint) => `${(Number(units) / 100).toFixed(2)} mUSD`;
const short = (value: string, head = 10, tail = 6) => `${value.slice(0, head)}…${value.slice(-tail)}`;

export default function PublicTokenPage() {
  const ops = useOps();
  const [theme, toggleTheme] = useTheme();
  const [sessions, setSessions] = useState<{ meridian?: TokenSession; alice?: TokenSession }>({});
  const [address, setAddress] = useState<string | null>(null);
  const [view, setView] = useState<PublicView | null>(null);
  const [ids, setIds] = useState<Awaited<ReturnType<typeof tokenIdentities>> | null>(null);
  const [genesis, setGenesis] = useState<string | null>(null);
  const [logsOn, setLogsOn] = useState(false);
  const viewBox = useRef<HTMLDivElement>(null);

  const network = getNetwork();
  const isLocalnet = network.networkId === 'undeployed';

  useEffect(() => {
    document.title = 'Unshielded Contract Token';
  }, []);

  // Identities and any remembered deployment — derivable before any wallet exists.
  useEffect(() => {
    void tokenIdentities().then(setIds);
    void recallToken().then((remembered) => {
      if (remembered) {
        setAddress(remembered);
        ops.say(`found deployed token ${remembered.slice(0, 10)}… on this chain`);
      }
    });
    void getGenesisHash().then(setGenesis).catch(() => setGenesis(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

  /** Refresh Eve's panel from real indexer state. */
  const refreshView = useCallback(async (at: string | null) => {
    if (!at) return;
    try {
      setView(await readPublicView(at));
    } catch {
      setView(null);
    }
  }, []);

  useEffect(() => {
    void refreshView(address);
    // Poll gently: state also changes when someone ELSE (e.g. the CLI) transacts.
    const timer = setInterval(() => void refreshView(address), 5000);
    return () => clearInterval(timer);
  }, [address, refreshView]);

  const onConnect = async () => {
    ops.setStatus('connecting');
    const meridian = await ops.step('Create wallet for Meridian (build + sync)', () =>
      connectPersona('meridian'),
    );
    if (!meridian) return;
    setSessions((prev) => ({ ...prev, meridian }));
    const alice = await ops.step('Create wallet for Alice (build + sync)', () =>
      connectPersona('alice'),
    );
    if (!alice) return;
    setSessions((prev) => ({ ...prev, alice }));
    ops.say('Bob and Eve need no wallet — a recipient is an account id; a reader needs nothing', 'ok');
    ops.setStatus('ready');
  };

  /** Run one proved lifecycle call, then re-read the public view. */
  const lifecycle = useCallback(
    async (
      label: string,
      fn: () => Promise<{ txId: string; blockHeight: number } | string>,
    ): Promise<void> => {
      ops.setStatus('working');
      const result = await ops.trackOp(label, () => ops.step(label, fn));
      if (result === undefined) {
        ops.endOp();
        return;
      }
      if (typeof result !== 'string') {
        ops.say(`tx ${result.txId.slice(0, 18)}… @ block ${result.blockHeight}`, 'ok');
      }
      ops.opReadingBack();
      await ops.step('Read public view (indexer)', () =>
        refreshView(typeof result === 'string' ? result : address),
      );
      ops.endOp();
      ops.setStatus('ready');
    },
    [address, ops, refreshView],
  );

  const onDeploy = async () => {
    if (!sessions.meridian) return;
    ops.setStatus('working');
    const deployed = await ops.trackOp('Deploy token', () =>
      ops.step('Deploy public-token (Meridian is owner)', () => deployToken(sessions.meridian!)),
    );
    if (!deployed) {
      ops.endOp();
      return;
    }
    setAddress(deployed);
    try {
      rememberToken(deployed, await getGenesisHash());
    } catch {
      ops.say('could not record token in history', 'error');
    }
    ops.opReadingBack();
    await ops.step('Read public view (indexer)', () => refreshView(deployed));
    ops.endOp();
    ops.setStatus('ready');
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
            Runs the real lifecycle; the public view is what anyone can see.
          </p>
        </div>
        <div className="topbar-right">
          {isLocalnet ? (
            <div
              className="net-pill local"
              title="Local development chain — disposable. A restart is a fresh chain; genesis seeds are public."
            >
              <span className="net-glyph" />
              <span>Local chain</span>
              <span className="net-meta">
                {network.networkId}
                {genesis ? ` · ${genesis.slice(0, 10)}…` : ''}
              </span>
            </div>
          ) : (
            <div className="net-pill stage">
              <span className="net-glyph" />
              <span>STAGENET</span>
              <span className="net-meta">{network.networkId}</span>
            </div>
          )}
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
              className={address ? 'card copyable' : 'card'}
              title={address ? `${address} — click to copy` : 'No token deployed'}
              onClick={() => {
                if (address) {
                  try {
                    void navigator.clipboard.writeText(address);
                    ops.say('token address copied');
                  } catch {
                    /* clipboard unavailable */
                  }
                }
              }}
            >
              <span className="label">Token</span>
              <span className="value small">{address ? short(address) : 'not deployed'}</span>
            </div>
            <div className="card">
              <span className="label">Issuer — Meridian</span>
              <span className="value small">
                {sessions.meridian
                  ? `${sessions.meridian.unshieldedBalance.toLocaleString('en-US')} unshielded`
                  : 'not created'}
              </span>
            </div>
          </section>

          <section className="actions">
            <button className="primary" onClick={onConnect} disabled={busy || ready}>
              {ready ? 'Wallets ready' : 'Create wallets'}
            </button>
            <button className="secondary" onClick={onDeploy} disabled={busy || !ready}>
              {address ? 'Deploy another' : 'Deploy token'}
            </button>
            <button
              className="secondary"
              onClick={() =>
                void lifecycle(`issue: mint ${fmt(ISSUE)} to Alice`, () =>
                  mint(sessions.meridian!, address!, ids!.ids.alice, ISSUE),
                )
              }
              disabled={busy || !ready || !address || !ids}
            >
              Issue {fmt(ISSUE)} → Alice
            </button>
            <button
              className="secondary"
              onClick={() =>
                void lifecycle(`transfer: Alice pays Bob ${fmt(PAY)}`, () =>
                  transfer(sessions.alice!, address!, ids!.ids.bob, PAY),
                )
              }
              disabled={busy || !ready || !address || !ids}
            >
              Alice pays Bob {fmt(PAY)}
            </button>
            <button
              className="secondary"
              onClick={() =>
                void lifecycle(`redeem: burn ${fmt(REDEEM)} from Alice`, () =>
                  burn(sessions.meridian!, address!, ids!.ids.alice, REDEEM),
                )
              }
              disabled={busy || !ready || !address || !ids}
            >
              Redeem {fmt(REDEEM)} ← Alice
            </button>
          </section>

          <OpBar op={ops.op} lastTiming={ops.lastTiming} now={ops.now} />

          <section className="log" aria-live="polite" ref={ops.logBox}>
            {ops.log.length === 0 && (
              <p className="muted">
                Create wallets, deploy, then run the lifecycle. Issuing and redeeming are
                Meridian-only; the transfer is signed by Alice.
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
          <section className="public-view" ref={viewBox}>
            <div className="public-view-head">
              <h2>Public view — what Eve sees</h2>
              <span className="muted small">no wallet · no keys · live indexer state</span>
            </div>

            {!address ? (
              <p className="muted small">
                Deploy a token and this panel fills itself — from nothing but the indexer.
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
