/**
 * Midnight Asset Studio — the product-first experience.
 *
 * Landing → guided issuance (token type → privacy → controls → custody →
 * network → review) → live deployment → asset dashboard. Everything on chain
 * is real: the deployment steps are actual transactions completing live, and
 * four token types deploy end to end today — the unshielded UTXO token, the
 * unshielded contract token, the ZSwap shielded UTXO token and the
 * confidential (CFT) shielded contract token.
 */

import { useEffect, useRef, useState } from 'react';

import { currentNetworkName, LogoMark, switchNetwork } from '@mra/lab-shell';

import FaucetSetup from '../labs/FaucetSetup.tsx';
import StagenetSeeds from '../labs/StagenetSeeds.tsx';
import Chip from './Chip.tsx';
import {
  assuranceRows,
  briefRows,
  clearConfig,
  CONTROL_DEFS,
  CUSTODY_DEFS,
  custodyLabel,
  DEFAULT_CONFIG,
  FEATURE_DEFS,
  loadConfig,
  privacyOverview,
  saveConfig,
  STAGE_LABELS,
  TOKEN_DEFS,
  tokenDef,
  type StudioConfig,
} from './config.ts';
import StudioDashboard from './StudioDashboard.tsx';
import { PERSONA_LABEL, useStudioChain, type PersonaId, type TokenKind } from './useStudioChain.ts';

type Screen = 'landing' | 'wizard' | 'compare' | 'deploy' | 'success' | 'dashboard';

const normSeed = (raw: string) => raw.trim().toLowerCase().replace(/^0x/, '');
const isSeed = (raw: string) => /^(?:[0-9a-f]{64}|[0-9a-f]{128})$/.test(raw);

const kindOf = (config: StudioConfig): TokenKind =>
  config.token === 'utxo-unshielded'
    ? 'utxo'
    : config.token === 'contract-unshielded'
      ? 'public'
      : config.token === 'zswap-shielded'
        ? 'zswap'
        : 'confidential';

export default function Studio() {
  const restored = useRef(loadConfig());
  const [screen, setScreen] = useState<Screen>(restored.current ? 'wizard' : 'landing');
  const [stage, setStage] = useState(restored.current?.stage ?? 1);
  const [maxStage, setMaxStage] = useState(restored.current?.stage ?? 1);
  const [config, setConfig] = useState<StudioConfig>(restored.current?.config ?? DEFAULT_CONFIG);
  const [seeds, setSeeds] = useState<Record<PersonaId, string>>({ acme: '', alice: '', bob: '' });
  const [deployNote, setDeployNote] = useState<string | null>(null);
  const chain = useStudioChain();

  const activeNetwork = currentNetworkName();
  const wantsStagenet = config.network === 'stagenet';
  const networkMatches = wantsStagenet === (activeNetwork === 'stagenet');
  const netLabel = wantsStagenet ? 'Stagenet' : 'Local development';
  const selected = tokenDef(config.token);

  useEffect(() => {
    document.title = 'Midnight Asset Studio';
  }, []);

  const set = <K extends keyof StudioConfig>(key: K, value: StudioConfig[K]) =>
    setConfig((prev) => ({ ...prev, [key]: value }));

  const go = (n: number) => {
    setStage(n);
    setMaxStage((m) => Math.max(m, n));
    window.scrollTo(0, 0);
  };

  const startDeploy = async () => {
    if (!networkMatches) {
      // The SDK's network id is process-global: switching networks reloads.
      // The (non-secret) wizard config persists so the studio resumes here.
      saveConfig(config, 6);
      if (
        confirm(
          `Deploying to ${netLabel} switches this page's network. The page reloads and returns to this step. Seeds never persist.`,
        )
      ) {
        switchNetwork(wantsStagenet ? 'stagenet' : 'localnet');
      }
      return;
    }
    if (wantsStagenet) {
      const typed = { acme: normSeed(seeds.acme), alice: normSeed(seeds.alice), bob: normSeed(seeds.bob) };
      if (!isSeed(typed.acme) || !isSeed(typed.alice) || !isSeed(typed.bob)) {
        setDeployNote('Stagenet needs three funded seeds — generate them below, fund each address, then deploy.');
        return;
      }
    }
    setDeployNote(null);
    setScreen('deploy');
    window.scrollTo(0, 0);
    const ok = await chain.runDeployment(
      kindOf(config),
      { name: config.assetName.trim() || selected.defaults.name, symbol: config.symbol.trim() || selected.defaults.symbol },
      wantsStagenet
        ? { acme: normSeed(seeds.acme), alice: normSeed(seeds.alice), bob: normSeed(seeds.bob) }
        : undefined,
    );
    if (ok) {
      clearConfig();
      setScreen('success');
      window.scrollTo(0, 0);
    }
  };

  const restart = () => {
    clearConfig();
    chain.reset();
    setConfig(DEFAULT_CONFIG);
    setStage(1);
    setMaxStage(1);
    setScreen('landing');
    window.scrollTo(0, 0);
  };

  const overview = privacyOverview(config.token);

  const header = (
    <div className="st-topbar">
      <div className="st-topbar-brand">
        <LogoMark className="st-logo" />
        <span className="st-wordmark">midnight</span>
        <span className="st-divider" />
        <span className="st-appname">Asset studio</span>
      </div>
      <div className="st-topbar-right">
        {screen === 'dashboard' && (
          <button className="st-btn ghost sm" onClick={restart}>
            New asset
          </button>
        )}
        <span className={`st-netpill${wantsStagenet ? '' : ' local'}`}>
          <span className="dot" />
          {netLabel}
        </span>
      </div>
    </div>
  );

  // ---- Landing --------------------------------------------------------------------

  if (screen === 'landing') {
    return (
      <div className="st-page">
        {header}
        <div className="st-landing">
          <div className="home-glow" />
          <div className="st-landing-inner">
            <LogoMark className="st-landing-logo" />
            <h1>Issue regulated assets on Midnight</h1>
            <p className="st-landing-lede">
              Choose a token type, set what stays confidential, keep issuer control, and deploy to
              a public network — in minutes, with zero-knowledge proofs generated on your own
              machine.
            </p>
            <div className="st-landing-points">
              <div><strong>Five token types.</strong> From fully public UTXOs to encrypted-balance contract tokens — one studio, real trade-offs.</div>
              <div><strong>Real deployments.</strong> Every step on the deploy screen is a live transaction; every dashboard number is chain state.</div>
              <div><strong>Built for institutions.</strong> Custody, approvals and disclosure are first-class configuration, not afterthoughts.</div>
            </div>
            <div className="cta-row">
              <button className="st-btn accent lg" onClick={() => { setScreen('wizard'); go(1); }}>
                Design your asset →
              </button>
              <button className="st-btn ghost lg" onClick={() => setScreen('compare')}>
                Compare token types
              </button>
            </div>
            <p className="st-muted-xs">Test networks · test assets · proofs stay on your machine</p>
          </div>
        </div>
      </div>
    );
  }

  // ---- Wizard + compare ---------------------------------------------------------------

  if (screen === 'wizard' || screen === 'compare') {
    return (
      <div className="st-page">
        {header}
        {screen === 'compare' ? (
          <div className="st-center">
            <div className="st-compare">
              <div className="st-head-block">
                <span className="st-overline">Token types</span>
                <h1>Midnight&apos;s token models, side by side</h1>
                <p>
                  Two axes: UTXO versus account model, unshielded versus shielded. Every product is
                  a composition of these primitives.
                </p>
              </div>
              <div className="st-table">
                <div className="st-table-head st-compare-grid">
                  <div>Token type</div><div>Balances</div><div>Transfer values</div><div>Supply</div>
                  <div>Issuer control</div><div>Today</div>
                </div>
                {TOKEN_DEFS.map((t) => (
                  <div key={t.id} className="st-table-row st-compare-grid">
                    <div className="st-cell-title">{t.name}<span>{t.model}</span></div>
                    <div>{t.id.includes('shielded') || t.id === 'contract-confidential' || t.id === 'contract-note' ? (t.id === 'contract-confidential' ? 'Encrypted' : 'Hidden') : 'Public'}</div>
                    <div>{t.id === 'contract-confidential' ? 'Hidden' : t.id === 'zswap-shielded' || t.id === 'contract-note' ? 'Hidden' : 'Public'}</div>
                    <div>{t.id === 'contract-confidential' || t.id === 'zswap-shielded' ? 'Public (attestable)' : t.id === 'contract-note' ? 'Design open' : 'Public'}</div>
                    <div>{t.id.startsWith('contract') ? (t.id === 'contract-note' ? 'Contract-enforced (design)' : 'Mint · redeem · policy hooks') : 'None after mint'}</div>
                    <div className="st-flag">{t.deployable ? 'Deploys from this studio' : 'Placeholder'}</div>
                  </div>
                ))}
              </div>
              <div>
                <button className="st-btn primary" onClick={() => setScreen('wizard')}>
                  Choose a token type →
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="st-wizard">
            <div className="st-rail">
              <div className="st-overline st-rail-title">Guided issuance</div>
              {STAGE_LABELS.map((label, i) => {
                const n = i + 1;
                const current = stage === n;
                const reachable = n <= maxStage;
                return (
                  <button
                    key={label}
                    className={`st-rail-item${current ? ' current' : ''}${reachable ? '' : ' locked'}`}
                    onClick={() => reachable && go(n)}
                    disabled={!reachable}
                  >
                    <span className="st-rail-num">0{n}</span>
                    <span>{label}</span>
                  </button>
                );
              })}
              <div className="st-rail-note">Test assets on a test network — nothing here moves real funds.</div>
            </div>

            <div className="st-main">
              {stage === 1 && (
                <div className="st-step">
                  <div className="st-head-block">
                    <span className="st-overline">Step 1 of 6 · Token type</span>
                    <h1>Choose your token type</h1>
                    <p>
                      Midnight gives you two state models — UTXO and account — each in an
                      unshielded and a shielded form. Pick the one your instrument needs;
                      every type except the note-based placeholder deploys from this studio today.
                    </p>
                  </div>
                  {TOKEN_DEFS.map((t) => (
                    <button
                      key={t.id}
                      className={`st-pick token${config.token === t.id ? ' selected' : ''}${t.deployable ? '' : ' undeployable'}`}
                      onClick={() =>
                        setConfig((c) => ({ ...c, token: t.id, assetName: t.defaults.name, symbol: t.defaults.symbol }))
                      }
                    >
                      <span className="st-pick-head">
                        <span className="st-radio" />
                        <span className="st-pick-title">{t.name}</span>
                        {t.id === 'contract-confidential' && <span className="st-flag accent">Recommended for regulated assets</span>}
                      </span>
                      <span className="st-pick-model">{t.model}</span>
                      <span className="st-pick-desc">{t.desc}</span>
                      <span className="st-pick-meta"><strong>Useful for:</strong> {t.usefulFor}</span>
                      <span className="st-checks">
                        {FEATURE_DEFS.map((f) => (
                          <span key={f.id} className={`st-check${t.features[f.id] ? ' on' : ''}`}>
                            <span className="st-checkbox">{t.features[f.id] ? '✓' : ''}</span>
                            {f.label}
                          </span>
                        ))}
                      </span>
                      <span className={`st-flag${t.deployable ? ' ok' : ''}`}>{t.statusLine}</span>
                    </button>
                  ))}
                  <div className="st-note">
                    The two unshielded types make the UTXO-versus-account contrast concrete: the
                    UTXO token is the chain&apos;s own money — simple, interoperable, uncontrolled.
                    Moving to the account model puts a contract between holders and balances, and
                    that contract is where issuer control lives. The shielded forms apply the same
                    split to private state.
                  </div>
                  <div>
                    <button className="st-btn ghost" onClick={() => setScreen('compare')}>
                      Compare token types →
                    </button>
                  </div>
                </div>
              )}

              {stage === 2 && (
                <div className="st-step">
                  <div className="st-head-block">
                    <span className="st-overline">Step 2 of 6 · Privacy overview</span>
                    <h1>What this token keeps private</h1>
                    <p>
                      {selected.name}: {selected.visibility} The profile below is what the model
                      enforces — fact by fact, audience by audience.
                    </p>
                  </div>
                  {overview.map((r) => (
                    <div key={r.fact} className="st-card st-priv-row">
                      <div className="st-priv-head">
                        <div className="st-priv-label">
                          <div className="st-strong">{r.fact}</div>
                          <div className="st-muted-sm">{r.desc}</div>
                        </div>
                        <span className={`st-flag big ${r.state === 'Public' ? '' : r.state === 'Public by design' ? 'accent' : 'ok'}`}>
                          {r.state}
                        </span>
                      </div>
                      <div className="st-priv-who">
                        <div><span className="st-who-k">Public</span>{r.who.pub}</div>
                        <div><span className="st-who-k">Issuer</span>{r.who.iss}</div>
                        <div><span className="st-who-k">Holder</span>{r.who.hold}</div>
                        <div><span className="st-who-k">Authorised reviewer</span>{r.who.rev}</div>
                      </div>
                    </div>
                  ))}
                  {config.token === 'contract-confidential' && (
                    <div className="st-note">
                      Values are private; participation is not. Sender and recipient identifiers —
                      and therefore the transaction graph — are public in this model. Full graph
                      privacy is what the note-based shielded contract token is being designed for.
                    </div>
                  )}
                </div>
              )}

              {stage === 3 && (
                <div className="st-step">
                  <div className="st-head-block">
                    <span className="st-overline">Step 3 of 6 · Issuer controls</span>
                    <h1>{config.token.startsWith('contract') ? 'Issuer and compliance controls' : 'This token has no issuer controls'}</h1>
                    <p>
                      {config.token.startsWith('contract')
                        ? 'Issuer control is the account model’s defining feature: the contract that holds balances is the thing that enforces policy. Controlled issue and redeem run today; everything else you enable becomes part of your target configuration.'
                        : 'UTXO tokens are bearer instruments: coins belong to whoever holds the keys, and nothing sits between holders and their funds.'}
                    </p>
                  </div>
                  {config.token.startsWith('contract') ? (
                    <>
                      {CONTROL_DEFS.map((c) => {
                        const locked = c.status === 'Not implemented';
                        const on = config.ctl[c.id];
                        return (
                          <div key={c.id} className={`st-card st-ctl-row${locked ? ' locked' : ''}`}>
                            <button
                              className={`st-switch${on ? ' on' : ''}`}
                              role="switch"
                              aria-checked={on}
                              disabled={locked}
                              onClick={() => set('ctl', { ...config.ctl, [c.id]: !on })}
                            >
                              <span />
                            </button>
                            <div className="st-grow">
                              <div className="st-strong">{c.label}</div>
                              <div className="st-muted-sm">{c.desc}</div>
                            </div>
                            <span className={`st-flag ${c.tone === 'success' ? 'ok' : c.tone === 'danger' ? 'err' : c.tone === 'warning' ? 'warn' : ''}`}>{c.status}</span>
                          </div>
                        );
                      })}
                    </>
                  ) : (
                    <>
                      <div className="st-card st-stack">
                        <div className="st-strong">Why there is nothing to configure here</div>
                        <div className="st-body-sm">
                          Pause, freeze, allowlists, transfer restrictions and controlled redemption
                          are all contract behaviours — they exist because a contract holds the
                          balances and can refuse an operation. A UTXO token has no such contract:
                          once minted, coins move under their holders&apos; signatures alone, and
                          contract control of UTXO assets is not yet available on Midnight.
                        </div>
                      </div>
                      <div className="st-card st-stack">
                        <div className="st-strong">What that buys you instead</div>
                        <div className="st-body-sm">
                          Bearer simplicity: no policy layer to administer, no issuer key to
                          protect after mint, and the widest interoperability — every wallet and
                          exchange integration speaks this model natively.
                        </div>
                      </div>
                      <div className="st-note">
                        If your instrument needs issuer control — and most regulated instruments do
                        — choose a contract token in step 1. The unshielded contract token adds
                        control with full transparency; the confidential token adds control with
                        private balances.
                      </div>
                    </>
                  )}
                </div>
              )}

              {stage === 4 && (
                <div className="st-step">
                  <div className="st-head-block">
                    <span className="st-overline">Step 4 of 6 · Custody &amp; approvals</span>
                    <h1>
                      {config.token.startsWith('contract')
                        ? 'How sensitive operations get approved'
                        : config.token === 'utxo-unshielded'
                          ? 'Custody is your existing key stack'
                          : 'Custody means protecting note secrets'}
                    </h1>
                    <p>
                      {config.token.startsWith('contract')
                        ? 'Pick the approval model your institution runs for issuer operations. These are distinct mechanisms — an HSM, an MPC quorum and a multisig protect different things.'
                        : config.token === 'utxo-unshielded'
                          ? 'Coins move under holder signatures alone — the exact case HSMs, MPC quorums, multisigs and threshold policies were built for. They apply directly, at the key layer, with no adaptation.'
                          : 'Spending a shielded coin is proof-based: the sensitive material is the note secret a local prover consumes, not a conventional signing key. Custody here means protecting witness material.'}
                    </p>
                  </div>
                  {config.token.startsWith('contract') ? (
                    <>
                      {CUSTODY_DEFS.map((k) => (
                        <button
                          key={k.id}
                          className={`st-pick slim${config.custody === k.id ? ' selected' : ''}`}
                          onClick={() => set('custody', k.id)}
                        >
                          <span className="st-pick-head">
                            <span className="st-radio" />
                            <span className="st-grow st-left">
                              <span className="st-strong">{k.label}</span>
                              <span className="st-muted-sm">{k.desc}</span>
                            </span>
                            <span className={`st-flag ${k.tone === 'success' ? 'ok' : k.tone === 'warning' ? 'warn' : ''}`}>{k.status}</span>
                          </span>
                        </button>
                      ))}
                      {config.custody !== 'demo' && (
                        <div className="st-note">
                          Recorded as your target approval policy. Studio deployments authorise with the
                          demonstration issuer key; the custody integration programme delivers the rest.
                        </div>
                      )}
                      <div className="st-card raised st-stack">
                        <span className="st-overline">How authorisation works</span>
                        <div className="st-qa"><div>What authorises asset movement</div><p>Issuer operations carry the issuer key&apos;s authority. Transfers carry the holder&apos;s, with a zero-knowledge proof validating the state transition.</p></div>
                        <div className="st-qa"><div>What must be protected</div><p>The issuer secret, each holder&apos;s key, and the witness material behind every proof — which is why custody integration covers more than signatures.</p></div>
                        <div className="st-qa"><div>Where proofs are generated</div><p>On the operator&apos;s own machine. Witness data never leaves it.</p></div>
                      </div>
                    </>
                  ) : config.token === 'utxo-unshielded' ? (
                    <>
                      <div className="st-two">
                        <div className="st-card st-stack">
                          <span className="st-flag ok">Applies directly</span>
                          <div className="st-strong">Holder-side key custody</div>
                          <div className="st-body-sm">
                            Signature-based authorisation over conventional keys: HSM-backed keys,
                            MPC / threshold signing, multisig and 2-of-3 approval policies all work
                            at the key layer, exactly as your institution runs them today.
                          </div>
                        </div>
                        <div className="st-card st-stack">
                          <span className="st-flag">Nothing to configure</span>
                          <div className="st-strong">No issuer approvals</div>
                          <div className="st-body-sm">
                            After mint there are no privileged operations on this token — no pause,
                            no freeze, no controlled redemption — so there is no approval policy for
                            the studio to record.
                          </div>
                        </div>
                      </div>
                      <div className="st-note">
                        If issuer operations need approval workflows, that is a contract-token
                        property — choose one in step 1.
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="st-two">
                        <div className="st-card st-stack">
                          <span className="st-flag warn">Adaptation area</span>
                          <div className="st-strong">What must be protected</div>
                          <div className="st-body-sm">
                            Note secrets and the witness material a proof consumes. A conventional
                            HSM signs data; it does not feed a prover — so shielded-UTXO custody is
                            an integration exercise, not a drop-in.
                          </div>
                        </div>
                        <div className="st-card st-stack">
                          <span className="st-flag">Nothing to configure</span>
                          <div className="st-strong">No issuer approvals</div>
                          <div className="st-body-sm">
                            Bearer instrument: there are no privileged operations after mint, so no
                            approval policy applies.
                          </div>
                        </div>
                      </div>
                      <div className="st-card raised st-stack">
                        <span className="st-overline">Proving trust boundary</span>
                        <div className="st-body-sm">
                          Proofs are generated on the operator&apos;s own machine — note secrets and
                          witness data never leave it.
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {stage === 5 && (
                <div className="st-step">
                  <div className="st-head-block">
                    <span className="st-overline">Step 5 of 6 · Network &amp; assurance</span>
                    <h1>Select a network</h1>
                    <p>The assurance summary states exactly what is verified where, and where the trust boundaries sit.</p>
                  </div>
                  <div className="st-two">
                    <button
                      className={`st-pick netcard${config.network === 'stagenet' ? ' selected' : ''}`}
                      onClick={() => set('network', 'stagenet')}
                    >
                      <span className="st-pick-head">
                        <span className="st-radio" />
                        <span className="st-pick-title">Stagenet</span>
                      </span>
                      <span className="st-body-sm">Midnight&apos;s public test network — the place to evaluate real public-network behaviour. Test assets only.</span>
                      <span className="st-verify">
                        <span className="ok">Wallet connectivity verified · first-time funding and DUST setup automated</span>
                        <span className="muted">Token lifecycle runs after faucet funding (one captcha per wallet)</span>
                      </span>
                    </button>
                    <button
                      className={`st-pick netcard${config.network === 'local' ? ' selected' : ''}`}
                      onClick={() => set('network', 'local')}
                    >
                      <span className="st-pick-head">
                        <span className="st-radio" />
                        <span className="st-pick-title">Local development</span>
                      </span>
                      <span className="st-body-sm">The full Midnight stack on your machine. Pre-funded wallets, instant start, fresh chain per session.</span>
                      <span className="st-verify">
                        <span className="ok">Full lifecycle verified: deploy, issue, transfer, redeem</span>
                        <span className="muted">Requires yarn localnet:up</span>
                      </span>
                    </button>
                  </div>
                  <div className="st-table">
                    <div className="st-table-title">
                      <span>Assurance summary</span>
                      <span className="st-muted-sm">Statuses come from the implementation</span>
                    </div>
                    {assuranceRows(config.network, config.token).map((a) => (
                      <div key={a.k} className="st-table-row st-assur-grid">
                        <div className="st-kcell">{a.k}</div>
                        <div>{a.v}</div>
                        <span className="st-flag">{a.chip}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {stage === 6 && (
                <div className="st-step">
                  <div className="st-head-block">
                    <span className="st-overline">Step 6 of 6 · Review &amp; deploy</span>
                    <h1>Review and deploy</h1>
                    <p>The deployment brief. Every line is editable by going back.</p>
                  </div>
                  {!selected.deployable && (
                    <div className="st-warnbox">
                      {selected.name} does not deploy from this studio yet — {selected.statusLine.toLowerCase()} Every
                      other token type deploys today.
                    </div>
                  )}
                  <div className="st-namegrid">
                    <label className="st-field">
                      <span>Asset name</span>
                      <input value={config.assetName} maxLength={48} onChange={(e) => set('assetName', e.target.value)} />
                    </label>
                    <label className="st-field">
                      <span>Symbol</span>
                      <input className="mono" value={config.symbol} maxLength={12} onChange={(e) => set('symbol', e.target.value)} />
                    </label>
                  </div>
                  <div className="st-table">
                    {briefRows(config).map((b) => (
                      <div key={b.k} className="st-table-row st-brief-grid">
                        <div className="st-kcell muted">{b.k}</div>
                        <div>{b.v}</div>
                      </div>
                    ))}
                  </div>
                  {wantsStagenet && networkMatches && selected.deployable && (
                    <div className="st-card st-stack">
                      <span className="st-overline">Stagenet wallets</span>
                      <div className="naming">
                        <StagenetSeeds
                          disabled={chain.busy}
                          say={(m) => setDeployNote(m)}
                          fields={(['acme', 'alice', 'bob'] as const).map((who) => ({
                            key: who,
                            label: `${PERSONA_LABEL[who]} seed`,
                            value: seeds[who],
                            onChange: (v: string) => setSeeds((prev) => ({ ...prev, [who]: v })),
                          }))}
                        />
                      </div>
                      <div className="st-muted-sm">
                        Fund each address from the faucet — the deploy screen hands you a per-wallet
                        faucet link and sets up DUST automatically when funds arrive.
                      </div>
                    </div>
                  )}
                  {deployNote && <div className="st-note">{deployNote}</div>}
                  <div className="st-deployrow">
                    <button className="st-btn accent lg" onClick={() => void startDeploy()} disabled={!selected.deployable}>
                      Deploy test asset →
                    </button>
                    <span className="st-muted-sm">
                      Deploys to {netLabel}. Test assets only.
                      {!networkMatches && ' Switching networks reloads the page and returns here.'}
                    </span>
                  </div>
                </div>
              )}

              <div className="st-wizard-nav">
                <div>
                  {stage > 1 && (
                    <button className="st-btn ghost" onClick={() => go(stage - 1)}>
                      Back
                    </button>
                  )}
                </div>
                {stage < 6 && (
                  <button className="st-btn primary" onClick={() => go(stage + 1)}>
                    Continue →
                  </button>
                )}
              </div>
            </div>

          </div>
        )}
      </div>
    );
  }

  // ---- Deploy (real steps completing live) --------------------------------------------

  if (screen === 'deploy') {
    const failed = chain.deploySteps.some((s) => s.state === 'failed');
    return (
      <div className="st-page">
        {header}
        <div className="st-center middle">
          <div className="st-deploy">
            <div className="st-head-block">
              <span className="st-overline">Deploying to {netLabel}</span>
              <h1>
                {config.assetName} ({config.symbol})
              </h1>
            </div>
            <div className="st-table">
              {chain.deploySteps.map((d) => (
                <div key={d.id} className="st-depstep">
                  <span className={`st-depmark ${d.state}`}>
                    {d.state === 'done' ? '✓' : d.state === 'failed' ? '✕' : d.state === 'running' ? '…' : ''}
                  </span>
                  <div className="st-grow">
                    <div className="st-strong">{d.label}</div>
                    <div className="st-mono-xs">{d.detail ?? d.tech}</div>
                    {d.sub.length > 0 && (
                      // key includes state so the dropdown re-mounts open while
                      // running and closed once settled — user toggles freely.
                      <details key={`${d.id}-${d.state}`} className="st-sublog" open={d.state === 'running'}>
                        <summary>
                          {d.state === 'running' ? 'live transaction stages' : `transaction stages (${d.sub.length})`}
                        </summary>
                        <div className="st-sublog-lines mono">
                          {d.sub.map((line, i) => (
                            <div key={i} className={i === d.sub.length - 1 && d.state === 'running' ? 'live' : ''}>
                              {line}
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="st-muted-sm">
              Live operations on the connected chain — a proved call takes ~18 s: proving ~0.3 s on
              this machine, block inclusion the rest.
            </div>
            {chain.opErr && <div className="st-errbox">{chain.opErr}</div>}
            {wantsStagenet &&
              (['acme', 'alice', 'bob'] as const).map((who) => {
                const wallet = chain.walletOf(who);
                const address = chain.walletAddress(who);
                return wallet && address ? (
                  <FaucetSetup
                    key={who}
                    label={PERSONA_LABEL[who]}
                    wallet={wallet}
                    address={address}
                    autoDust={false}
                    say={(m) => setDeployNote(m)}
                  />
                ) : null;
              })}
            {deployNote && wantsStagenet && <div className="st-note">{deployNote}</div>}
            {failed && (
              <div className="st-deployrow">
                <button className="st-btn accent" onClick={() => void startDeploy()}>
                  Retry deployment
                </button>
                <button className="st-btn ghost" onClick={() => setScreen('wizard')}>
                  Back to review
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---- Success --------------------------------------------------------------------------

  if (screen === 'success') {
    return (
      <div className="st-page">
        {header}
        <div className="st-center middle">
          <div className="st-success">
            <span className="st-successmark">✓</span>
            <h1>Asset deployed</h1>
            <p className="st-body-sm">
              {config.assetName} ({config.symbol}) is live on {netLabel}.
            </p>
            <div className="st-table">
              <div className="st-table-row st-brief-grid"><div className="st-kcell muted">Contract address</div><div className="mono st-copy" title="click to copy" onClick={() => chain.address && void navigator.clipboard.writeText(chain.address)}>{chain.address}</div></div>
              <div className="st-table-row st-brief-grid"><div className="st-kcell muted">Network</div><div>{netLabel}</div></div>
              {briefRows(config)
                .filter((b) => b.k === 'Technical composition' || b.k === 'Privacy profile')
                .map((b) => (
                  <div key={b.k} className="st-table-row st-brief-grid"><div className="st-kcell muted">{b.k === 'Technical composition' ? 'Standard' : b.k}</div><div>{b.v}</div></div>
                ))}
            </div>
            <div>
              <button className="st-btn accent" onClick={() => setScreen('dashboard')}>
                Go to the asset dashboard →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Dashboard ----------------------------------------------------------------------------

  return (
    <div className="st-page">
      {header}
      <StudioDashboard
        config={config}
        chain={chain}
        custodyName={custodyLabel(config.custody)}
        onToggleCtl={(id, value) => set('ctl', { ...config.ctl, [id]: value })}
      />
    </div>
  );
}
