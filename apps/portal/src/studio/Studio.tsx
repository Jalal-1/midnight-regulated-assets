/**
 * Midnight Asset Studio — the product-first experience.
 *
 * A guided issuance wizard (product → privacy → controls → custody → network →
 * review) flowing into an asset dashboard. Faithful to the Asset Studio design
 * with ONE deliberate upgrade over its mock: everything on chain is REAL. The
 * deployment screen's steps are actual transactions completing live; issue,
 * transfer and redeem are proved calls with real ids and measured durations;
 * the dashboard's supply is read from the indexer. Where the design simulated,
 * this implementation performs.
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
  loadConfig,
  privacyRows,
  PRODUCT_NAME,
  saveConfig,
  STAGE_LABELS,
  visibilityProfile,
  type StudioConfig,
} from './config.ts';
import StudioDashboard from './StudioDashboard.tsx';
import { PERSONA_LABEL, useStudioChain, type PersonaId } from './useStudioChain.ts';

type Screen = 'wizard' | 'compare' | 'deploy' | 'success' | 'dashboard';

const normSeed = (raw: string) => raw.trim().toLowerCase().replace(/^0x/, '');
const isSeed = (raw: string) => /^[0-9a-f]{64}$/.test(raw);

export default function Studio() {
  const restored = useRef(loadConfig());
  const [screen, setScreen] = useState<Screen>('wizard');
  const [stage, setStage] = useState(restored.current?.stage ?? 1);
  const [maxStage, setMaxStage] = useState(restored.current?.stage ?? 1);
  const [config, setConfig] = useState<StudioConfig>(restored.current?.config ?? DEFAULT_CONFIG);
  const [seeds, setSeeds] = useState<Record<PersonaId, string>>({ acme: '', alice: '', bob: '' });
  const [deployNote, setDeployNote] = useState<string | null>(null);
  const chain = useStudioChain();

  const activeNetwork = currentNetworkName();
  const wantsStagenet = config.network === 'stagenet';
  const networkMatches = wantsStagenet === (activeNetwork === 'stagenet');
  const netLabel = config.network === 'stagenet' ? 'Stagenet — test network' : 'Local development';

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
      // The SDK's network id is process-global: switching networks must reload.
      // Persist the (non-secret) wizard config so the studio resumes here.
      saveConfig(config, 6);
      if (
        confirm(
          `Deploying to ${netLabel} requires switching this page's network. The page reloads and returns to this step (seeds are not kept — they never persist).`,
        )
      ) {
        switchNetwork(wantsStagenet ? 'stagenet' : 'localnet');
      }
      return;
    }
    if (wantsStagenet) {
      const typed = { acme: normSeed(seeds.acme), alice: normSeed(seeds.alice), bob: normSeed(seeds.bob) };
      if (!isSeed(typed.acme) || !isSeed(typed.alice) || !isSeed(typed.bob)) {
        setDeployNote('Stagenet needs three 64-hex faucet-funded seeds — generate them below, fund each address, then deploy.');
        return;
      }
    }
    setDeployNote(null);
    setScreen('deploy');
    window.scrollTo(0, 0);
    const ok = await chain.runDeployment(
      { name: config.assetName.trim() || 'Confidential deposit token', symbol: config.symbol.trim() || 'CDT' },
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
    setScreen('wizard');
    window.scrollTo(0, 0);
  };

  const profile = visibilityProfile(config.priv);
  const rows = privacyRows(config.priv);

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
        <Chip tone="accent" dot>
          {netLabel}
        </Chip>
        <Chip tone="neutral">Demonstration environment</Chip>
      </div>
    </div>
  );

  // ---- Wizard ------------------------------------------------------------------

  if (screen === 'wizard' || screen === 'compare') {
    return (
      <div className="st-page">
        {header}
        {screen === 'compare' ? (
          <div className="st-center">
            <div className="st-compare">
              <div className="st-head-block">
                <span className="st-overline">Asset architectures</span>
                <h1>Compare asset models</h1>
                <p>
                  Every product is a different composition of the same building blocks. Properties
                  are stated neutrally; statuses come from the implementation, not aspiration.
                </p>
              </div>
              <div className="st-table">
                <div className="st-table-head st-compare-grid">
                  <div>Model</div><div>Balances</div><div>Transfer values</div><div>Supply</div>
                  <div>Custody &amp; controls</div><div>Status</div>
                </div>
                <div className="st-table-row st-compare-grid">
                  <div className="st-cell-title">Confidential fungible token<span>Account-based</span></div>
                  <div>Encrypted</div><div>Hidden</div><div>Public (extension)</div>
                  <div>Controlled issue &amp; redeem; richer controls designed</div>
                  <Chip tone="success">Recommended · demonstrated</Chip>
                </div>
                <div className="st-table-row st-compare-grid">
                  <div className="st-cell-title">Public contract token<span>Transparency baseline</span></div>
                  <div>Public</div><div>Public</div><div>Public</div>
                  <div>Controlled issue &amp; redeem</div>
                  <Chip tone="accent">Demonstrated</Chip>
                </div>
                <div className="st-table-row st-compare-grid">
                  <div className="st-cell-title">Native token<span>UTXO-level</span></div>
                  <div>Public</div><div>Public</div><div>Public</div>
                  <div>Limited contract control</div>
                  <Chip tone="neutral">Status page only</Chip>
                </div>
                <div className="st-table-row st-compare-grid">
                  <div className="st-cell-title">Shielded UTXO token<span>Archived upstream</span></div>
                  <div>Shielded</div><div>Shielded</div><div>Unreliable accounting</div>
                  <div>No pause or freeze — no custom spend logic</div>
                  <Chip tone="danger">Not custody-compatible</Chip>
                </div>
              </div>
              <div className="st-note">
                The shielded UTXO module is kept in <span className="mono">archive/</span> by its
                maintainers — “archived until further notice, do not use in production” — citing
                missing custom spend logic and unreliable total-supply accounting. It is shown here
                so the trade-off is visible, not to recommend it.
              </div>
              <div>
                <button className="st-btn primary" onClick={() => setScreen('wizard')}>
                  Back to product selection
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
              <div className="st-rail-note">
                Test assets on a {config.network === 'stagenet' ? 'public test network' : 'local development chain'}.
                Nothing here moves real funds.
              </div>
            </div>

            <div className="st-main">
              {stage === 1 && (
                <div className="st-step">
                  <div className="st-head-block">
                    <span className="st-overline">Step 1 of 6 · Financial product</span>
                    <h1>What would you like to issue?</h1>
                    <p>Start from the financial product. Privacy, controls, custody and network follow from it.</p>
                  </div>
                  <button
                    className={`st-pick${config.product === 'deposit' ? ' selected' : ''}`}
                    onClick={() => setConfig((c) => ({ ...c, product: 'deposit', assetName: PRODUCT_NAME.deposit.name, symbol: PRODUCT_NAME.deposit.symbol }))}
                  >
                    <span className="st-pick-head">
                      <span className="st-radio" />
                      <span className="st-pick-title">Confidential deposit token</span>
                      <Chip tone="accent">Recommended</Chip>
                      <Chip tone="success">Demonstrated on localnet</Chip>
                    </span>
                    <span className="st-pick-desc">
                      Private commercial-bank money for institutional payments, settlement and on-chain liquidity.
                    </span>
                    <span className="st-pick-meta">
                      Private balances · private transfer values · controlled issue &amp; redeem · public-network settlement
                    </span>
                  </button>
                  <button
                    className={`st-pick${config.product === 'mmf' ? ' selected' : ''}`}
                    onClick={() => setConfig((c) => ({ ...c, product: 'mmf', assetName: PRODUCT_NAME.mmf.name, symbol: PRODUCT_NAME.mmf.symbol }))}
                  >
                    <span className="st-pick-head">
                      <span className="st-radio" />
                      <span className="st-pick-title">Tokenised money-market fund</span>
                      <Chip tone="neutral">Designed — not built yet</Chip>
                    </span>
                    <span className="st-pick-desc">
                      Private investor positions with issuance, redemption, eligibility and collateral controls.
                    </span>
                  </button>
                  <button
                    className={`st-pick${config.product === 'custom' ? ' selected' : ''}`}
                    onClick={() => setConfig((c) => ({ ...c, product: 'custom', assetName: PRODUCT_NAME.custom.name, symbol: PRODUCT_NAME.custom.symbol }))}
                  >
                    <span className="st-pick-head">
                      <span className="st-radio" />
                      <span className="st-pick-title">Custom regulated asset</span>
                      <Chip tone="neutral">Advanced path</Chip>
                    </span>
                    <span className="st-pick-desc">
                      Configure a different financial instrument using Midnight&apos;s asset models.
                    </span>
                  </button>
                  <div>
                    <button className="st-btn ghost" onClick={() => setScreen('compare')}>
                      Compare asset architectures →
                    </button>
                  </div>
                </div>
              )}

              {stage === 2 && (
                <div className="st-step">
                  <div className="st-head-block">
                    <span className="st-overline">Step 2 of 6 · Privacy &amp; disclosure</span>
                    <h1>What must remain confidential?</h1>
                    <p>
                      Every choice shows exactly who can see what — and whether the mechanism exists
                      today. The visibility profile on the right updates live.
                    </p>
                  </div>
                  {rows.map((r) => (
                    <div key={r.id} className="st-card st-priv-row">
                      <div className="st-priv-head">
                        <div className="st-priv-label">
                          <div className="st-strong">{r.label}</div>
                          <div className="st-muted-sm">{r.desc}</div>
                        </div>
                        <div className="st-priv-controls">
                          <Chip tone={r.tone}>{r.status}</Chip>
                          <div className="st-seg">
                            <button
                              className={r.on ? 'on' : ''}
                              onClick={() => set('priv', { ...config.priv, [r.id]: true })}
                            >
                              Confidential
                            </button>
                            <button
                              className={r.on ? '' : 'on'}
                              onClick={() => set('priv', { ...config.priv, [r.id]: false })}
                            >
                              Public
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="st-priv-who">
                        <div><span className="st-who-k">Public</span>{r.pub}</div>
                        <div><span className="st-who-k">Issuer</span>{r.iss}</div>
                        <div><span className="st-who-k">Holder</span>{r.hold}</div>
                        <div><span className="st-who-k">Authorised reviewer</span>{r.rev}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {stage === 3 && (
                <div className="st-step">
                  <div className="st-head-block">
                    <span className="st-overline">Step 3 of 6 · Issuer controls</span>
                    <h1>Issuer and compliance controls</h1>
                    <p>Each control carries its implementation status. Nothing is presented as live unless it runs today.</p>
                  </div>
                  <div className="st-legend">
                    <span><strong>Demonstrated</strong> — runs on localnet today</span>
                    <span><strong>Designed</strong> — specified, not built</span>
                    <span><strong>Requires extension</strong> — needs a module extension</span>
                    <span><strong>Not implemented</strong> — cannot be selected</span>
                  </div>
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
                        <Chip tone={c.tone}>{c.status}</Chip>
                      </div>
                    );
                  })}
                  <div className="st-muted-sm">
                    Enabling a designed control records it in your target configuration; it does not
                    make it live. The current demonstration enforces controlled issue and redeem
                    under a single issuer authority.
                  </div>
                </div>
              )}

              {stage === 4 && (
                <div className="st-step">
                  <div className="st-head-block">
                    <span className="st-overline">Step 4 of 6 · Custody &amp; approvals</span>
                    <h1>How should sensitive operations be approved?</h1>
                    <p>Choose the approval model your institution expects. These are distinct models, not interchangeable labels.</p>
                  </div>
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
                        <Chip tone={k.tone}>{k.status}</Chip>
                      </span>
                    </button>
                  ))}
                  {config.custody !== 'demo' && (
                    <div className="st-warnbox">
                      Recorded as your target approval policy. Deployments from this studio authorise
                      with the demonstration issuer key until custody integration lands.
                    </div>
                  )}
                  <div className="st-two">
                    <div className="st-card st-stack">
                      <Chip tone="success">What runs today</Chip>
                      <div className="st-strong">Current demonstration</div>
                      <div className="st-body-sm">
                        A single issuer authority (<span className="mono">Ownable</span>). Every
                        sensitive operation is authorised by one demonstration key.
                      </div>
                    </div>
                    <div className="st-card st-stack">
                      <Chip tone="neutral">Designed</Chip>
                      <div className="st-strong">Institutional target architecture</div>
                      <div className="st-body-sm">
                        Integration with established custody, HSM, MPC, multisig and
                        threshold-approval environments — shaped through extensive technical
                        feedback from institutional custodians.
                      </div>
                    </div>
                  </div>
                  <div className="st-card raised st-stack">
                    <span className="st-overline">How authorisation works here</span>
                    <div className="st-qa"><div>What authorises asset movement</div><p>Issuer operations are authorised by the issuer key. Transfers are authorised by the holder&apos;s key, with a zero-knowledge proof validating the confidential state transition.</p></div>
                    <div className="st-qa"><div>Signature-based or proof-based</div><p>Both. Signatures establish authority; proofs validate state. Custody integration therefore concerns keys and witness material, not just signatures.</p></div>
                    <div className="st-qa"><div>What must be protected</div><p>The issuer secret, each holder&apos;s key, and the witness material used to build proofs.</p></div>
                    <div className="st-qa"><div>Where proofs are generated</div><p>Locally, by a proof server on the operator&apos;s machine — witness data never leaves it. A hosted prover is configurable but not wired to a real provider.</p></div>
                  </div>
                </div>
              )}

              {stage === 5 && (
                <div className="st-step">
                  <div className="st-head-block">
                    <span className="st-overline">Step 5 of 6 · Network &amp; assurance</span>
                    <h1>Select a network and review assurance</h1>
                    <p>Read the assurance summary before deploying. It states what is verified, what is pending, and where trust boundaries sit.</p>
                  </div>
                  <div className="st-two">
                    <button
                      className={`st-pick netcard${config.network === 'stagenet' ? ' selected' : ''}`}
                      onClick={() => set('network', 'stagenet')}
                    >
                      <span className="st-pick-head">
                        <span className="st-radio" />
                        <span className="st-pick-title">Stagenet</span>
                        <Chip tone="accent">Public test network</Chip>
                      </span>
                      <span className="st-body-sm">Shared public ledger. Test assets only. The right place to evaluate public-network behaviour.</span>
                      <span className="st-verify">
                        <span className="ok">Verified — wallet connectivity</span>
                        <span className="warn">Not yet verified — issue, transfer and redeem lifecycle (funding is captcha-gated)</span>
                      </span>
                    </button>
                    <button
                      className={`st-pick netcard${config.network === 'local' ? ' selected' : ''}`}
                      onClick={() => set('network', 'local')}
                    >
                      <span className="st-pick-head">
                        <span className="st-radio" />
                        <span className="st-pick-title">Local development</span>
                        <Chip tone="neutral">Runs from source</Chip>
                      </span>
                      <span className="st-body-sm">Requires the local Midnight stack. Chain state resets between sessions. Intended for engineering and testing.</span>
                      <span className="st-verify">
                        <span className="ok">Verified — full lifecycle: deploy, issue, transfer, redeem</span>
                        <span className="muted">State may reset; every session starts a fresh chain</span>
                      </span>
                    </button>
                  </div>
                  <div className="st-table">
                    <div className="st-table-title">
                      <span>Assurance summary</span>
                      <span className="st-muted-sm">Statuses reflect the implementation, not intent</span>
                    </div>
                    {assuranceRows(config.network).map((a) => (
                      <div key={a.k} className="st-table-row st-assur-grid">
                        <div className="st-kcell">{a.k}</div>
                        <div>{a.v}</div>
                        <Chip tone={a.tone}>{a.chip}</Chip>
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
                    <p>A concise deployment brief. Everything below is editable by going back.</p>
                  </div>
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
                  {wantsStagenet && networkMatches && (
                    <div className="st-card st-stack">
                      <span className="st-overline">Stagenet wallets — developer/test entry</span>
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
                        Each wallet must hold NIGHT before deployment — the deploy screen shows a
                        faucet hand-off per wallet and designates DUST automatically when funds arrive.
                      </div>
                    </div>
                  )}
                  {deployNote && <div className="st-warnbox">{deployNote}</div>}
                  <div className="st-deployrow">
                    <button className="st-btn accent lg" onClick={() => void startDeploy()}>
                      Deploy test asset →
                    </button>
                    <span className="st-muted-sm">
                      Deploys to {netLabel}. Test assets only — no real funds.
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

            {stage >= 2 && stage <= 5 && (
              <div className="st-profile">
                <div className="st-overline">Visibility profile</div>
                {profile.list.map((audience) => (
                  <div key={audience.aud} className="st-profile-card">
                    <div className="st-strong-sm">{audience.aud}</div>
                    {audience.lines.map((line) => (
                      <div key={line} className="st-profile-line">{line}</div>
                    ))}
                  </div>
                ))}
                {profile.warn && <div className="st-warnbox sm">{profile.warn}</div>}
                <div className="st-muted-xs">
                  Updates live as you choose. The same profile powers the visibility inspector after
                  deployment.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ---- Deploy (REAL steps completing live) ------------------------------------------

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
                  </div>
                </div>
              ))}
            </div>
            <div className="st-muted-sm">
              Every step above is a real operation completing live — a proved call takes ~18 s
              (proving ~0.3 s, block inclusion the rest). Raw detail stays under Technical details.
            </div>
            {chain.opErr && <div className="st-errbox">{chain.opErr}</div>}
            {wantsStagenet &&
              (['acme', 'alice', 'bob'] as const).map((who) => {
                const session = chain.sessions[who];
                return session ? (
                  <FaucetSetup
                    key={who}
                    label={PERSONA_LABEL[who]}
                    wallet={session.wallet}
                    address={session.unshieldedAddress}
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

  // ---- Success ------------------------------------------------------------------------

  if (screen === 'success') {
    const nextSteps: readonly { label: string; tab: string }[] = [
      { label: 'Issue the first units', tab: 'issue' },
      { label: 'Review participants', tab: 'participants' },
      { label: 'Make a test transfer', tab: 'issue' },
      { label: 'Inspect who can see what', tab: 'visibility' },
      { label: 'Test redemption', tab: 'issue' },
      { label: 'Explore composability', tab: 'compose' },
    ];
    return (
      <div className="st-page">
        {header}
        <div className="st-center middle">
          <div className="st-success">
            <span className="st-successmark">✓</span>
            <h1>Asset deployed</h1>
            <p className="st-body-sm">
              {config.assetName} ({config.symbol}) is live on {netLabel} as a test asset.
            </p>
            <div className="st-table">
              <div className="st-table-row st-brief-grid"><div className="st-kcell muted">Contract address</div><div className="mono st-copy" title="click to copy" onClick={() => chain.address && void navigator.clipboard.writeText(chain.address)}>{chain.address}</div></div>
              <div className="st-table-row st-brief-grid"><div className="st-kcell muted">Network</div><div>{netLabel}</div></div>
              <div className="st-table-row st-brief-grid"><div className="st-kcell muted">Standard</div><div>Confidential fungible token + public-supply extension (OpenZeppelin Compact)</div></div>
              <div className="st-table-row st-brief-grid"><div className="st-kcell muted">Privacy profile</div><div>Balances encrypted · transfer values hidden · identifiers, graph and supply public</div></div>
            </div>
            <div className="st-nextsteps">
              <span className="st-overline">Recommended next steps</span>
              {nextSteps.map((n, i) => (
                <button key={n.label} className="st-nextstep" onClick={() => setScreen('dashboard')}>
                  <span className="st-rail-num accent">0{i + 1}</span>
                  <span className="st-grow st-left">{n.label}</span>
                  <span>→</span>
                </button>
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

  // ---- Dashboard --------------------------------------------------------------------------

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
