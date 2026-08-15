/**
 * The asset dashboard — post-deployment management surface.
 *
 * Real data contract: supply and registration state come from the indexer;
 * holder balances are the sessions' wallet-side plaintext (labelled as such);
 * activity rows carry real transaction ids and measured durations; the
 * infrastructure cards are live probes. Participants are the REAL demo cast —
 * the studio does not fabricate addable participants, because a participant
 * without a funded wallet cannot register on this model.
 */

import { useEffect, useState } from 'react';

import { getProvingObserver, probeAll, type InfraStatus } from '@mra/lab-shell';

import Chip from './Chip.tsx';
import { assuranceRows, CONTROL_DEFS, type StudioConfig } from './config.ts';
import { hex, PERSONA_LABEL, type PersonaId, type StudioChain } from './useStudioChain.ts';

type Tab =
  | 'overview' | 'issue' | 'participants' | 'policy' | 'custody'
  | 'visibility' | 'activity' | 'compose' | 'assurance' | 'tech';

const NAV: readonly [Tab, string][] = [
  ['overview', 'Overview'],
  ['issue', 'Issue & redeem'],
  ['participants', 'Participants'],
  ['policy', 'Policy & controls'],
  ['custody', 'Custody & approvals'],
  ['visibility', 'Visibility'],
  ['activity', 'Activity'],
  ['compose', 'Composability'],
  ['assurance', 'Assurance'],
  ['tech', 'Technical details'],
];

const fmt = (units: bigint) =>
  (Number(units) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const parseUnits = (raw: string): bigint => {
  const n = parseFloat(raw.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? BigInt(Math.round(n * 100)) : 0n;
};

export default function StudioDashboard({
  config,
  chain,
  custodyName,
  onToggleCtl,
}: {
  readonly config: StudioConfig;
  readonly chain: StudioChain;
  readonly custodyName: string;
  readonly onToggleCtl: (id: keyof StudioConfig['ctl'], value: boolean) => void;
}) {
  const [tab, setTab] = useState<Tab>('overview');
  const [persona, setPersona] = useState<'public' | 'issuer' | 'alice' | 'bob' | 'auditor'>('public');
  const [forms, setForms] = useState({
    issueAmt: '1,000.00', issueTo: 'alice' as 'alice' | 'bob',
    xferAmt: '250.00', xferFrom: 'alice' as 'alice' | 'bob', xferTo: 'bob' as 'alice' | 'bob',
    redeemAmt: '500.00', redeemFrom: 'alice' as 'alice' | 'bob',
  });
  const [infra, setInfra] = useState<InfraStatus | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);

  useEffect(() => {
    if (tab !== 'tech') return;
    let live = true;
    const tick = async () => {
      const next = await probeAll(getProvingObserver());
      if (live) setInfra(next);
    };
    void tick();
    const timer = setInterval(() => void tick(), 4000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [tab]);

  const view = chain.view;
  const supply = view?.totalSupply ?? 0n;
  const symbol = view?.symbol ?? config.symbol;
  const busy = chain.busy;
  const holders: readonly PersonaId[] = ['alice', 'bob'];
  const goTab = (t: Tab) => () => {
    chain.clearOp();
    setTab(t);
  };

  const registeredIds = new Set((view?.registered ?? []).map(hex));
  const isRegistered = (who: PersonaId) => {
    const session = chain.sessions[who];
    return !!session && registeredIds.has(hex(session.tokenWallet.id));
  };

  const matrixRows = (() => {
    type Key = 'vis' | 'enc' | 'own' | 'no' | 'ni';
    const chip: Record<Key, [string, 'neutral' | 'accent' | 'success' | 'warning' | 'danger']> = {
      vis: ['Visible', 'neutral'], enc: ['Encrypted', 'accent'], own: ['Own data', 'success'],
      no: ['Not visible', 'warning'], ni: ['Not implemented', 'danger'],
    };
    const R = (f: string, k: Key, note: string) => ({ f, chip: chip[k][0], tone: chip[k][1], note });
    const base = [
      R('Asset identity', 'vis', `${config.assetName} (${symbol}) — address and standard are public`),
      R('Total supply', 'vis', `${fmt(supply)} ${symbol} — via the public-supply extension (read live from the indexer)`),
      R('Holder identity', 'vis', 'Account identifiers appear on the public ledger'),
      R('Individual balance', 'enc', 'Ciphertext only — plaintext is unreadable'),
      R('Transfer value', 'enc', 'Amounts are hidden in every transfer'),
      R('Sender', 'vis', 'Sender identifier is public'),
      R('Recipient', 'vis', 'Recipient identifier is public'),
      R('Transaction graph', 'vis', 'Who transacts with whom is observable'),
      R('Policy state', 'vis', 'Issuer control state is public'),
    ];
    if (persona === 'public') return base;
    const m = [...base];
    if (persona === 'issuer') {
      m[3] = R('Individual balance', 'no', 'No issuer viewing mechanism exists in the current module');
      m[4] = R('Transfer value', 'own', 'Issue and redeem amounts only — holder transfers stay hidden');
      m[8] = R('Policy state', 'vis', 'Administered by the issuer key');
      return m;
    }
    if (persona === 'alice' || persona === 'bob') {
      const name = persona === 'alice' ? 'Alice' : 'Bob';
      const balance = chain.balances[persona] ?? 0n;
      m[3] = R('Individual balance', 'own', `${name} sees their own balance: ${fmt(balance)} ${symbol} (wallet-side plaintext, proof-verified)`);
      m[4] = R('Transfer value', 'own', `Visible for transfers ${name} takes part in — all others stay hidden`);
      return m;
    }
    m[3] = R('Individual balance', 'ni', 'No privileged view — the reviewer sees ciphertext, like the public');
    m[4] = R('Transfer value', 'ni', 'No disclosure mechanism exists in the pinned module');
    return m;
  })();

  const personaDesc: Record<typeof persona, string> = {
    public: 'Anyone on the network — an exchange, an analyst, a competitor. Sees the ledger; cannot read confidential state.',
    issuer: 'ACME Bank, the issuing institution. Controls issue and redeem; cannot read holder balances.',
    alice: 'A participant. Sees her own wallet state and nothing of anyone else’s.',
    bob: 'A participant. Sees his own wallet state and nothing of anyone else’s.',
    auditor: 'A regulator or auditor with a legal right to inspect.',
  };

  return (
    <div className="st-dash">
      <div className="st-rail">
        <div className="st-overline st-rail-title">Asset management</div>
        {NAV.map(([id, label]) => (
          <button key={id} className={`st-rail-item${tab === id ? ' current' : ''}`} onClick={goTab(id)}>
            <span>{label}</span>
          </button>
        ))}
        <div className="st-rail-note">
          Demonstration asset. Lifecycle verified on localnet; Stagenet lifecycle pending.
        </div>
      </div>

      <div className="st-dashmain">
        <div className="st-dashhead">
          <div className="st-dashtitle">
            <h1>{config.assetName}</h1>
            <Chip tone="inverse">{symbol}</Chip>
            <Chip tone="neutral">OZ confidential fungible token</Chip>
            <Chip tone="success" dot>Active</Chip>
          </div>
          <div
            className="st-mono-xs st-copy"
            title="click to copy"
            onClick={() => chain.address && void navigator.clipboard.writeText(chain.address)}
          >
            {chain.address}
          </div>
          <div className="st-dashactions">
            <button className="st-btn accent sm" onClick={goTab('issue')} disabled={busy}>Issue</button>
            <button className="st-btn outline sm" onClick={goTab('issue')} disabled={busy}>Redeem</button>
            <button className="st-btn outline sm" onClick={goTab('issue')} disabled={busy}>Transfer</button>
            <button className="st-btn ghost sm" onClick={goTab('participants')}>Participants</button>
            <button className="st-btn ghost sm" onClick={goTab('policy')}>Controls</button>
            <button className="st-btn ghost sm" onClick={goTab('visibility')}>Inspect visibility</button>
          </div>
        </div>

        {chain.opErr && <div className="st-errbox inpage">{chain.opErr}</div>}
        {busy && (
          <div className="st-workbox inpage">
            Working — a proved call takes ~18 s (proving ~0.3 s, block inclusion the rest). Do not reload.
          </div>
        )}
        {!busy && chain.lastOp && (
          <div className="st-okbox inpage">
            {chain.lastOp.label} · tx {chain.lastOp.tx} · completed in {(chain.lastOp.ms / 1000).toFixed(1)} s.
          </div>
        )}

        <div className="st-dashbody">
          {tab === 'overview' && (
            <div className="st-step">
              <div className="st-tiles">
                <div className="st-tile"><span>Circulating supply <em>· public</em></span><strong>{fmt(supply)} <small>{symbol}</small></strong></div>
                <div className="st-tile"><span>Issued this session</span><strong>{fmt(chain.issuedTotal)}</strong></div>
                <div className="st-tile"><span>Redeemed this session</span><strong>{fmt(chain.redeemedTotal)}</strong></div>
                <div className="st-tile"><span>Registered participants <em>· public</em></span><strong>{view?.registered.length ?? 0}</strong></div>
              </div>
              {supply === 0n && (
                <div className="st-card st-cta">
                  <div>
                    <div className="st-strong">No units in circulation yet</div>
                    <div className="st-body-sm">Issue the first units to begin the lifecycle.</div>
                  </div>
                  <button className="st-btn accent sm" onClick={goTab('issue')}>Issue the first units →</button>
                </div>
              )}
              <div className="st-two">
                <div className="st-card st-stack">
                  <div className="st-kcell muted">Privacy profile</div>
                  <div className="st-body-sm">Balances encrypted · transfer values hidden<br />Identifiers, transaction graph and supply public</div>
                  <button className="st-btn ghost sm st-left" onClick={goTab('visibility')}>Inspect who can see what →</button>
                </div>
                <div className="st-card st-stack">
                  <div className="st-kcell muted">Custody &amp; approvals</div>
                  <div className="st-inline"><span className="st-body-sm">Single demonstration issuer key</span><Chip tone="warning">Demonstration</Chip></div>
                  <div className="st-muted-sm">Target: {custodyName} — designed, not yet integrated.</div>
                </div>
                <div className="st-card st-stack">
                  <div className="st-kcell muted">Disclosure</div>
                  <div className="st-inline"><span className="st-body-sm">Authorised-reviewer view</span><Chip tone="danger">Not implemented</Chip></div>
                  <div className="st-muted-sm">No privileged disclosure mechanism exists in the pinned module. A reviewer sees the public view.</div>
                </div>
                <div className="st-card st-stack">
                  <div className="st-kcell muted">Outstanding assurance gaps</div>
                  <div className="st-body-sm">Stagenet lifecycle not yet verified<br />Custody integration designed, not built<br />Standard is pre-audit (0.3.0-alpha.2, patched)</div>
                  <button className="st-btn ghost sm st-left" onClick={goTab('assurance')}>Full assurance summary →</button>
                </div>
              </div>
              <div className="st-table">
                <div className="st-table-title"><span>Recent activity</span><button className="st-btn ghost sm" onClick={goTab('activity')}>All activity →</button></div>
                {chain.activity.length === 0 ? (
                  <div className="st-empty">No activity yet.</div>
                ) : (
                  chain.activity.slice(0, 4).map((ev, i) => (
                    <div key={i} className="st-actrow">
                      <span className="st-mono-xs">{ev.t}</span>
                      <span className="st-grow">{ev.label}</span>
                      <span className="st-mono-xs">{ev.tx}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {tab === 'issue' && (
            <div className="st-step">
              <div className="st-note">
                This demonstration operates every party — issuer, Alice and Bob — so the full
                lifecycle can be exercised end to end. Issuance and incoming transfers land as
                pending and are swept to spendable by the recipient — a separate, real proved
                transaction the activity log shows explicitly.
              </div>
              <div className="st-three">
                <div className="st-card st-stack">
                  <div className="st-strong">Issue</div>
                  <label className="st-field"><span>Amount</span>
                    <input value={forms.issueAmt} onChange={(e) => setForms((f) => ({ ...f, issueAmt: e.target.value }))} disabled={busy} />
                  </label>
                  <label className="st-field"><span>To</span>
                    <select value={forms.issueTo} onChange={(e) => setForms((f) => ({ ...f, issueTo: e.target.value as 'alice' | 'bob' }))} disabled={busy}>
                      {holders.map((h) => <option key={h} value={h}>{PERSONA_LABEL[h]}</option>)}
                    </select>
                  </label>
                  <button
                    className="st-btn accent sm"
                    disabled={busy || parseUnits(forms.issueAmt) === 0n || !isRegistered(forms.issueTo)}
                    title={isRegistered(forms.issueTo) ? undefined : 'Recipient is not registered on-chain yet'}
                    onClick={() => void chain.issue(forms.issueTo, parseUnits(forms.issueAmt))}
                  >
                    Issue
                  </button>
                  <div className="st-muted-xs">Mint under issuer authority — each issue amount is visible as a public supply delta.</div>
                </div>
                <div className="st-card st-stack">
                  <div className="st-strong">Transfer</div>
                  <label className="st-field"><span>From</span>
                    <select value={forms.xferFrom} onChange={(e) => setForms((f) => ({ ...f, xferFrom: e.target.value as 'alice' | 'bob' }))} disabled={busy}>
                      {holders.map((h) => <option key={h} value={h}>{PERSONA_LABEL[h]}</option>)}
                    </select>
                  </label>
                  <label className="st-field"><span>To</span>
                    <select value={forms.xferTo} onChange={(e) => setForms((f) => ({ ...f, xferTo: e.target.value as 'alice' | 'bob' }))} disabled={busy}>
                      {holders.map((h) => <option key={h} value={h}>{PERSONA_LABEL[h]}</option>)}
                    </select>
                  </label>
                  <label className="st-field"><span>Amount</span>
                    <input value={forms.xferAmt} onChange={(e) => setForms((f) => ({ ...f, xferAmt: e.target.value }))} disabled={busy} />
                  </label>
                  <button
                    className="st-btn primary sm"
                    disabled={busy || parseUnits(forms.xferAmt) === 0n}
                    onClick={() => void chain.transfer(forms.xferFrom, forms.xferTo, parseUnits(forms.xferAmt))}
                  >
                    Transfer
                  </button>
                  <div className="st-muted-xs">Value hidden on the public ledger; identifiers visible.</div>
                </div>
                <div className="st-card st-stack">
                  <div className="st-strong">Redeem</div>
                  <label className="st-field"><span>From</span>
                    <select value={forms.redeemFrom} onChange={(e) => setForms((f) => ({ ...f, redeemFrom: e.target.value as 'alice' | 'bob' }))} disabled={busy}>
                      {holders.map((h) => <option key={h} value={h}>{PERSONA_LABEL[h]}</option>)}
                    </select>
                  </label>
                  <label className="st-field"><span>Amount</span>
                    <input value={forms.redeemAmt} onChange={(e) => setForms((f) => ({ ...f, redeemAmt: e.target.value }))} disabled={busy} />
                  </label>
                  <button
                    className="st-btn outline sm"
                    disabled={busy || parseUnits(forms.redeemAmt) === 0n}
                    onClick={() => void chain.redeem(forms.redeemFrom, parseUnits(forms.redeemAmt))}
                  >
                    Redeem
                  </button>
                  <div className="st-muted-xs">Burn units returned to the issuer — the supply delta is public.</div>
                </div>
              </div>
              <div className="st-card raised st-stack st-holderview">
                <div className="st-kcell muted">Holder view — wallet-side plaintext, private to each holder</div>
                {holders.map((h) => {
                  const session = chain.sessions[h];
                  if (!session) return null;
                  const w = session.tokenWallet;
                  return (
                    <div key={h} className="st-inline spread">
                      <span className="st-body-sm">{PERSONA_LABEL[h]}</span>
                      <span className="st-strong mono">
                        {fmt(w.spendable)} {symbol}
                        {w.pending > 0n && <em className="st-muted-xs"> (+{fmt(w.pending)} pending)</em>}
                      </span>
                    </div>
                  );
                })}
                <div className="st-muted-xs">
                  On the public ledger these balances are ciphertexts. They are readable here because
                  the demonstration holds every party&apos;s wallet — and every proof the chain
                  accepted verified them against those ciphertexts.
                </div>
              </div>
            </div>
          )}

          {tab === 'participants' && (
            <div className="st-step">
              <div className="st-note">
                Participants are the demonstration cast, with their REAL on-chain identities and
                registration state. Arbitrary participants are not addable here: on this model a
                participant needs a funded wallet to register an encryption key, and the studio
                does not fabricate records. On-chain allowlist enforcement is designed, not
                implemented.
              </div>
              <div className="st-table">
                <div className="st-table-head st-part-grid"><div>Name</div><div>Role</div><div>Account id (public)</div><div>Registration</div></div>
                {(['acme', 'alice', 'bob'] as const).map((who) => {
                  const session = chain.sessions[who];
                  const registered = who === 'acme' ? null : isRegistered(who);
                  return (
                    <div key={who} className="st-table-row st-part-grid">
                      <div className="st-strong">{PERSONA_LABEL[who]}</div>
                      <div>{who === 'acme' ? 'Issuer' : 'Participant'}</div>
                      <div className="st-mono-xs">{session ? `${hex(session.tokenWallet.id).slice(0, 20)}…` : '—'}</div>
                      {registered === null ? (
                        <Chip tone="neutral">Issuer key</Chip>
                      ) : registered ? (
                        <Chip tone="success">Registered on-chain</Chip>
                      ) : (
                        <Chip tone="warning">Not registered</Chip>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'policy' && (
            <div className="st-step">
              <div className="st-note">
                Toggling a designed control updates the target configuration only. Live today:
                controlled issue and redeem under the issuer key.
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
                      onClick={() => onToggleCtl(c.id, !on)}
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
            </div>
          )}

          {tab === 'custody' && (
            <div className="st-step">
              <div className="st-two">
                <div className="st-card st-stack">
                  <Chip tone="success">What runs today</Chip>
                  <div className="st-strong">Current demonstration</div>
                  <div className="st-body-sm">A single issuer authority (<span className="mono">Ownable</span>). Every sensitive operation on this asset is authorised by one demonstration key.</div>
                </div>
                <div className="st-card st-stack">
                  <Chip tone="neutral">Designed</Chip>
                  <div className="st-strong">Institutional target architecture</div>
                  <div className="st-body-sm">Your selected policy: <strong>{custodyName}</strong>. Integration with established custody, HSM, MPC, multisig and threshold-approval environments is designed, not built.</div>
                </div>
              </div>
              <div className="st-card raised st-stack">
                <div className="st-qa"><div>What authorises asset movement</div><p>Issuer operations: the issuer key. Transfers: the holder&apos;s key plus a zero-knowledge proof of the confidential state transition.</p></div>
                <div className="st-qa"><div>What must be protected</div><p>The issuer secret, holder keys, and proof witness material.</p></div>
                <div className="st-qa"><div>Proving trust boundary</div><p>Proofs are generated by a local proof server — witness data never leaves the operator&apos;s machine. A hosted prover is configurable but not wired to a real provider.</p></div>
              </div>
            </div>
          )}

          {tab === 'visibility' && (
            <div className="st-step">
              <div className="st-head-block tight">
                <h2>Who can see what?</h2>
                <p className="st-body-sm">Switch perspective. Field-level visibility reflects the current implementation of the confidential fungible token — not aspiration.</p>
              </div>
              <div className="st-personas">
                {(['public', 'issuer', 'alice', 'bob', 'auditor'] as const).map((p) => (
                  <button key={p} className={`st-tag${persona === p ? ' active' : ''}`} onClick={() => setPersona(p)}>
                    {{ public: 'Public observer', issuer: 'Issuer', alice: 'Alice', bob: 'Bob', auditor: 'Authorised auditor' }[p]}
                  </button>
                ))}
              </div>
              {persona === 'auditor' && (
                <div className="st-errbox">
                  No authorised-reviewer disclosure mechanism exists in the current implementation. A
                  reviewer today sees only the public view. Viewing-key disclosure is on the platform
                  roadmap.
                </div>
              )}
              <div className="st-body-sm">{personaDesc[persona]}</div>
              <div className="st-table">
                {matrixRows.map((m) => (
                  <div key={m.f} className="st-table-row st-matrix-grid">
                    <div className="st-strong-sm">{m.f}</div>
                    <Chip tone={m.tone}>{m.chip}</Chip>
                    <div>{m.note}</div>
                  </div>
                ))}
              </div>
              <div className="st-muted-xs">
                The public can observe ciphertexts, account identifiers and the transaction graph —
                but cannot read plaintext balances or transfer values.
              </div>
            </div>
          )}

          {tab === 'activity' && (
            <div className="st-step">
              {chain.activity.length === 0 ? (
                <div className="st-card st-cta center">
                  <div>
                    <div className="st-strong">No activity yet</div>
                    <div className="st-body-sm">Issue the first units to begin the lifecycle.</div>
                  </div>
                  <button className="st-btn accent sm" onClick={goTab('issue')}>Issue the first units →</button>
                </div>
              ) : (
                <>
                  <div className="st-table">
                    {chain.activity.map((ev, i) => (
                      <div key={i} className="st-actrow wide">
                        <span className="st-mono-xs">{ev.t}</span>
                        <span className="st-grow">{ev.label}</span>
                        <span className="st-muted-xs">{ev.note}</span>
                        <span className="st-mono-xs">{ev.tx}</span>
                      </div>
                    ))}
                  </div>
                  <div className="st-muted-xs">
                    Transfer values in this log are visible because the demonstration operates every
                    party. On the public ledger they are hidden. Every id is a real transaction on
                    the connected chain; durations are measured, not scripted.
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'compose' && (
            <div className="st-step">
              <blockquote className="st-quote">Privacy and institutional control should follow the asset into the applications where it is used.</blockquote>
              <h2>What can this asset do next?</h2>
              <div className="st-two">
                <div className="st-card st-stack"><div className="st-inline spread"><span className="st-strong-sm">Redeem through the issuer</span><Chip tone="success">Demonstrated</Chip></div><div className="st-muted-sm">Burn against the issuer — runs today, exercisable in Issue &amp; redeem.</div></div>
                <div className="st-card st-stack"><div className="st-inline spread"><span className="st-strong-sm">Settle an approved transfer</span><Chip tone="success">Demonstrated</Chip></div><div className="st-muted-sm">Value-private transfer between participants on public infrastructure.</div></div>
                <div className="st-card st-stack"><div className="st-inline spread"><span className="st-strong-sm">Subscribe to a regulated fund</span><Chip tone="neutral">Planned</Chip></div><div className="st-muted-sm">The tokenised money-market fund composition is designed; this deposit token is its cash leg.</div></div>
                <div className="st-card st-stack"><div className="st-inline spread"><span className="st-strong-sm">Post as collateral</span><Chip tone="neutral">Planned</Chip></div><div className="st-muted-sm">Collateral designation for a fund or security position.</div></div>
                <div className="st-card st-stack"><div className="st-inline spread"><span className="st-strong-sm">Private delivery versus payment</span><Chip tone="neutral">Planned</Chip></div><div className="st-muted-sm">Offers-based atomic settlement — cash leg and asset leg, private quantities, approved counterparties.</div></div>
                <div className="st-card st-stack"><div className="st-inline spread"><span className="st-strong-sm">Integrate with an approved application</span><Chip tone="warning">Requires integration</Chip></div><div className="st-muted-sm">Contract-to-contract composability currently carries unshielded data only — no value movement across calls.</div></div>
              </div>
              <div className="st-muted-xs">No integration shown here is faked. Statuses come from the project roadmap.</div>
            </div>
          )}

          {tab === 'assurance' && (
            <div className="st-step">
              <div className="st-table">
                <div className="st-table-title"><span>Assurance summary</span><span className="st-muted-sm">Statuses reflect the implementation, not intent</span></div>
                {assuranceRows(config.network).map((a) => (
                  <div key={a.k} className="st-table-row st-assur-grid">
                    <div className="st-kcell">{a.k}</div>
                    <div>{a.v}</div>
                    <Chip tone={a.tone}>{a.chip}</Chip>
                  </div>
                ))}
              </div>
              <div className="st-muted-xs">
                OpenZeppelin is designing and auditing the standards. A specific implementation is
                labelled audited only when an applicable audit is complete — none is yet.
              </div>
            </div>
          )}

          {tab === 'tech' && (
            <div className="st-step">
              <div className="st-note">Deliberately outside the primary journey. Everything an operator needs; nothing a product owner has to see first.</div>
              <div className="st-three">
                {(['node', 'indexer', 'proof'] as const).map((k) => {
                  const s = infra?.[k];
                  const health = s?.health ?? 'unknown';
                  return (
                    <div key={k} className="st-card st-stack">
                      <div className="st-inline">
                        <span className={`st-dot ${health}`} />
                        <span className="st-strong-sm">{k === 'node' ? 'Node' : k === 'indexer' ? 'Indexer' : 'Proof server'}</span>
                        <span className="st-muted-xs">{health}</span>
                      </div>
                      <div className="st-muted-sm">
                        {k === 'node' && (infra?.node.chain ? `${infra.node.chain} · best #${infra.node.best?.toLocaleString('en-US')}` : 'probing…')}
                        {k === 'indexer' && (infra?.indexer.indexed !== undefined ? `indexed #${infra.indexer.indexed.toLocaleString('en-US')} · ${infra.indexer.lag !== undefined && infra.indexer.lag <= 1 ? 'in step' : `${infra?.indexer.lag ?? '—'} blocks behind`}` : 'GraphQL, version-scoped path (api/v4)')}
                        {k === 'proof' && 'Local by default — witness data never leaves this machine'}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="st-table">
                <div className="st-table-title"><span>Configuration</span></div>
                <div className="st-table-row st-brief-grid"><div className="st-kcell muted">Endpoints</div><div>Defined once, in <span className="mono">packages/network</span> — nowhere else</div></div>
                <div className="st-table-row st-brief-grid"><div className="st-kcell muted">Pinned stack</div><div>RC3 set moves together — <span className="mono">ops/versions.lock.json</span></div></div>
                <div className="st-table-row st-brief-grid"><div className="st-kcell muted">Compiler</div><div>Pinned <span className="mono">compactc</span>; this contract compiles WITHOUT <span className="mono">--feature-zkir-v3</span> (documented compiler issue)</div></div>
                <div className="st-table-row st-brief-grid"><div className="st-kcell muted">Module</div><div><span className="mono">@openzeppelin/compact-contracts 0.3.0-alpha.2</span> — patched (typed Jubjub scalars, Compact 0.25)</div></div>
              </div>
              <div>
                <button className="st-btn ghost sm" onClick={() => setLogsOpen((v) => !v)}>
                  {logsOpen ? 'Hide raw activity' : 'Show raw activity'}
                </button>
                {logsOpen && (
                  <div className="st-rawlog">
                    {chain.activity.length === 0
                      ? 'no operations yet'
                      : chain.activity.map((ev, i) => (
                          <div key={i}>{ev.t} · {ev.label} · {ev.note} · tx {ev.tx}</div>
                        ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
