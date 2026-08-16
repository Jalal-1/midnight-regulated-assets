/**
 * The asset dashboard — post-deployment management surface for all four
 * deployable token kinds. Supply, holders and registration state come off the
 * indexer (UTXO-kind holder balances come from the demo wallets themselves);
 * confidential holder balances are the sessions' wallet-side plaintext
 * (labelled as such); activity rows carry real transaction ids and measured
 * durations; the infrastructure cards are live probes.
 */

import { useEffect, useState } from 'react';

import { getProvingObserver, probeAll, type InfraStatus } from '@mra/lab-shell';

import Chip from './Chip.tsx';
import { assuranceRows, CONTROL_DEFS, tokenDef, type StudioConfig } from './config.ts';
import { PERSONA_LABEL, type StudioChain } from './useStudioChain.ts';

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
  const kind = chain.kind;
  const confidential = kind === 'confidential';
  const utxoKind = kind === 'utxo' || kind === 'zswap';
  const shielded = kind === 'zswap' || confidential;
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
  const holders = ['alice', 'bob'] as const;
  const goTab = (t: Tab) => () => {
    chain.clearOp();
    setTab(t);
  };

  const matrixRows = (() => {
    type Key = 'vis' | 'enc' | 'own' | 'no' | 'ni';
    const chip: Record<Key, [string, 'neutral' | 'accent' | 'success' | 'warning' | 'danger']> = {
      vis: ['Visible', 'neutral'], enc: ['Encrypted', 'accent'], own: ['Own data', 'success'],
      no: ['Not visible', 'warning'], ni: ['Not implemented', 'danger'],
    };
    const R = (f: string, k: Key, note: string) => ({ f, chip: chip[k][0], tone: chip[k][1], note });
    if (kind === 'public' || kind === 'utxo') {
      // The transparency baseline: identical full view for every perspective.
      const utxo = kind === 'utxo';
      return [
        R('Asset identity', 'vis', `${config.assetName} (${symbol}) — ${utxo ? 'mint contract and token type are public' : 'address and standard are public'}`),
        R('Total supply', 'vis', `${fmt(supply)} ${symbol} — ${utxo ? 'total minted, public contract state' : 'read live from the indexer'}`),
        R('Holder identity', 'vis', utxo ? 'Wallet addresses are public' : 'Account identifiers are public'),
        R('Individual balance', 'vis', utxo ? 'The sum of a wallet’s coins — enumerable from the public UTXO set' : 'Every balance is public contract state — anyone can enumerate the full holder map'),
        R('Transfer value', 'vis', 'Every amount is public'),
        R('Sender & recipient', 'vis', utxo ? 'Both wallet addresses are public on every transfer' : 'Both identifiers are public on every transfer'),
        R('Transaction graph', 'vis', 'Fully observable'),
        R('Policy state', 'vis', utxo ? 'The mint contract’s owner is public; the coins themselves carry no policy' : 'Issuer control state is public'),
      ];
    }
    if (kind === 'zswap') {
      const base = [
        R('Asset identity', 'vis', `${config.assetName} (${symbol}) — mint contract and token type are public`),
        R('Total issued', 'vis', `${fmt(supply)} ${symbol} — public contract state, so issuance stays attestable`),
        R('Holder identity', 'no', 'Coins live in the shielded pool — no holder addresses on the public ledger'),
        R('Individual balance', 'no', 'The chain holds commitments; no balance is derivable from public data'),
        R('Transfer value', 'no', 'Amounts are hidden in every shielded transfer'),
        R('Sender & recipient', 'no', 'Both ends of a shielded transfer are hidden'),
        R('Transaction graph', 'no', 'Who transacts with whom is not observable'),
        R('Policy state', 'vis', 'The mint contract’s owner is public; the coins themselves carry no policy'),
      ];
      if (persona === 'public') return base;
      const m = [...base];
      if (persona === 'issuer') {
        m[3] = R('Individual balance', 'no', 'The issuer has no view into holder balances after minting');
        m[4] = R('Transfer value', 'own', 'Mint amounts only — holder-to-holder transfers stay hidden');
        return m;
      }
      if (persona === 'alice' || persona === 'bob') {
        const name = persona === 'alice' ? 'Alice' : 'Bob';
        const balance = chain.balances[persona] ?? 0n;
        m[3] = R('Individual balance', 'own', `${name} sees their own wallet: ${fmt(balance)} ${symbol} — decrypted with their own keys`);
        m[4] = R('Transfer value', 'own', `Visible for transfers ${name} takes part in — all others stay hidden`);
        return m;
      }
      m[3] = R('Individual balance', 'ni', 'No privileged view — the reviewer sees commitments, like the public');
      m[4] = R('Transfer value', 'ni', 'No selective-disclosure mechanism exists for shielded UTXOs');
      return m;
    }
    const base = [
      R('Asset identity', 'vis', `${config.assetName} (${symbol}) — address and standard are public`),
      R('Total supply', 'vis', `${fmt(supply)} ${symbol} — via the public-supply extension, read live from the indexer`),
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
    m[4] = R('Transfer value', 'ni', 'Viewing-key disclosure is on the roadmap, not in the pinned module');
    return m;
  })();

  const personaDesc: Record<typeof persona, string> = {
    public: 'Anyone on the network — an exchange, an analyst, a competitor.',
    issuer: 'ACME Bank, the issuing institution. Controls issue and redeem.',
    alice: 'A participant. Sees her own wallet state.',
    bob: 'A participant. Sees his own wallet state.',
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
      </div>

      <div className="st-dashmain">
        <div className="st-dashhead">
          <div className="st-dashtitle">
            <h1>{config.assetName}</h1>
            <span className="st-flag mono">{symbol}</span>
            <span className="st-flag">{tokenDef(config.token).name}</span>
            <span className="st-flag ok">Active</span>
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
            <button className="st-btn outline sm" onClick={goTab('issue')} disabled={busy}>{utxoKind ? 'Return' : 'Redeem'}</button>
            <button className="st-btn outline sm" onClick={goTab('issue')} disabled={busy}>Transfer</button>
            <button className="st-btn ghost sm" onClick={goTab('participants')}>Participants</button>
            <button className="st-btn ghost sm" onClick={goTab('visibility')}>Inspect visibility</button>
          </div>
        </div>

        {chain.sponsored && (
          <div className="st-note inpage">
            Customer fees are issuer-sponsored. Alice and Bob hold no DUST; they sign and bind
            their own transactions, and ACME Bank attaches the fee and submits.
          </div>
        )}
        {chain.opErr && <div className="st-errbox inpage">{chain.opErr}</div>}
        {busy && (
          <div className="st-workbox inpage">
            {chain.opStage ?? 'Working — a proved call takes ~18 s (proving ~0.3 s, block inclusion the rest). Do not reload.'}
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
                <div className="st-tile"><span>{utxoKind ? 'Total issued' : 'Circulating supply'} <em>· public</em></span><strong>{fmt(supply)} <small>{symbol}</small></strong></div>
                <div className="st-tile"><span>Issued this session</span><strong>{fmt(chain.issuedTotal)}</strong></div>
                <div className="st-tile"><span>{utxoKind ? 'Returned this session' : 'Redeemed this session'}</span><strong>{fmt(chain.redeemedTotal)}</strong></div>
                {confidential ? (
                  <div className="st-tile"><span>Registered participants <em>· public</em></span><strong>{view?.registeredCount ?? 0}</strong></div>
                ) : utxoKind ? (
                  <div className="st-tile"><span>Held by demo wallets {kind === 'zswap' ? <em>· holders’ own view</em> : <em>· public</em>}</span><strong>{fmt((chain.balances.alice ?? 0n) + (chain.balances.bob ?? 0n))}</strong></div>
                ) : (
                  <div className="st-tile"><span>Holders <em>· public</em></span><strong>{view?.holders?.length ?? 0}</strong></div>
                )}
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
                  <div className="st-body-sm">
                    {confidential
                      ? <>Balances encrypted · transfer values hidden<br />Identifiers, transaction graph and supply public</>
                      : kind === 'zswap'
                        ? <>Amounts, senders and recipients hidden — the chain sees commitments.<br />Total issuance stays public and attestable.</>
                        : kind === 'utxo'
                          ? <>Fully public — coins, amounts and counterparties visible in the UTXO set.<br />The transparency baseline, wallet-native.</>
                          : <>Fully public: every holder, balance and transfer is enumerable.</>}
                  </div>
                  <button className="st-btn ghost sm st-left" onClick={goTab('visibility')}>Inspect who can see what →</button>
                </div>
                <div className="st-card st-stack">
                  <div className="st-kcell muted">Custody &amp; approvals</div>
                  <div className="st-body-sm">Demonstration issuer key</div>
                  <div className="st-muted-sm">Target: {custodyName} — delivered by the custody integration programme.</div>
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
                {confidential
                  ? 'Incoming funds land as pending and the recipient sweeps them spendable — a separate transaction, shown in the activity log.'
                  : kind === 'zswap'
                    ? 'Minting is a contract call; every movement after that is a wallet-level shielded transfer. Amounts and parties are hidden.'
                    : kind === 'utxo'
                      ? 'Minting is a contract call; every movement after that is a wallet-level transfer of native coins. All details are public.'
                      : 'Every amount and balance on this token is public the moment it confirms.'}
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
                    disabled={busy || parseUnits(forms.issueAmt) === 0n || (confidential && !chain.registered(forms.issueTo))}
                    onClick={() => void chain.issue(forms.issueTo, parseUnits(forms.issueAmt))}
                  >
                    Issue
                  </button>
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
                  <div className="st-muted-xs">{shielded ? 'Value hidden on the public ledger.' : 'Amount public on the ledger.'}{utxoKind ? ' Wallet-to-wallet — no contract involved.' : ''}</div>
                </div>
                <div className="st-card st-stack">
                  <div className="st-strong">{utxoKind ? 'Return to issuer' : 'Redeem'}</div>
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
                    {utxoKind ? 'Return' : 'Redeem'}
                  </button>
                  {utxoKind && <div className="st-muted-xs">Bearer coins have no burn — redemption is a transfer back to the issuer’s wallet.</div>}
                </div>
              </div>
              <div className="st-card raised st-stack st-holderview">
                <div className="st-kcell muted">
                  {confidential
                    ? 'Holder view — wallet-side plaintext, private to each holder'
                    : kind === 'zswap'
                      ? 'Holder view — each holder’s own shielded balance, decrypted with their own keys'
                      : kind === 'utxo'
                        ? 'Holder balances — native coins in each wallet, public on the ledger'
                        : 'Holder balances — public contract state, read from the indexer'}
                </div>
                {holders.map((h) => {
                  const balance = chain.balances[h];
                  const pendingUnits = chain.pending[h] ?? 0n;
                  if (balance === undefined) return null;
                  return (
                    <div key={h} className="st-inline spread">
                      <span className="st-body-sm">{PERSONA_LABEL[h]}</span>
                      <span className="st-strong mono">
                        {fmt(balance)} {symbol}
                        {confidential && pendingUnits > 0n && <em className="st-muted-xs"> (+{fmt(pendingUnits)} pending)</em>}
                      </span>
                    </div>
                  );
                })}
                <div className="st-muted-xs">
                  {confidential
                    ? 'On the public ledger these balances are ciphertexts. They are readable here because the demonstration holds every party’s wallet — and every accepted proof verified them against those ciphertexts.'
                    : kind === 'zswap'
                      ? 'On the public ledger these balances are commitments. They are readable here only because the demonstration holds every party’s wallet keys.'
                      : 'Anyone on the network can read these balances; no wallet or key is required.'}
                </div>
              </div>
            </div>
          )}

          {tab === 'participants' && (
            <div className="st-step">
              <div className="st-note">
                The demonstration cast, with real on-chain identities.{' '}
                {confidential
                  ? 'On this token a participant registers an encryption key before receiving — registration state below is public chain data.'
                  : utxoKind
                    ? 'On this token any wallet can hold — coins move wallet-to-wallet with no registration step and no gatekeeping.'
                    : 'On this token anyone can hold — there is no registration step and no gatekeeping.'}
              </div>
              <div className="st-table">
                <div className="st-table-head st-part-grid"><div>Name</div><div>Role</div><div>{utxoKind ? 'Wallet address' : 'Account id (public)'}</div><div>{confidential ? 'Registration' : 'Holding'}</div></div>
                {(['acme', 'alice', 'bob'] as const).map((who) => {
                  const id = utxoKind ? chain.walletAddress(who) : chain.accountIdHex(who);
                  return (
                    <div key={who} className="st-table-row st-part-grid">
                      <div className="st-strong">{PERSONA_LABEL[who]}</div>
                      <div>{who === 'acme' ? 'Issuer' : 'Participant'}</div>
                      <div className="st-mono-xs">{id ? `${id.slice(0, 20)}…` : '—'}</div>
                      <div className="st-flag">
                        {who === 'acme'
                          ? 'Issuer key'
                          : confidential
                            ? chain.registered(who) ? 'Registered on-chain' : 'Not registered'
                            : 'No registration required'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'policy' && utxoKind && (
            <div className="st-step">
              <div className="st-note">
                Live today: owner-gated minting under the issuer key. That is the whole policy
                surface for this token type.
              </div>
              <div className="st-card st-stack">
                <div className="st-strong">No post-mint controls exist on this token</div>
                <div className="st-body-sm">
                  {kind === 'utxo'
                    ? 'The coins are ledger-native UTXOs. Once minted they move wallet-to-wallet like NIGHT — no contract sits in the transfer path, so pause, freeze or transfer restrictions cannot be enforced on the token itself.'
                    : 'The coins live in the shielded pool. Once minted they move as shielded UTXOs — no contract sits in the transfer path, so pause, freeze or transfer restrictions cannot be enforced on the token itself.'}
                </div>
                <div className="st-muted-sm">
                  If your product needs issuer controls after issuance, choose a contract-based token —
                  the unshielded contract token or the confidential token — where every movement passes
                  through contract logic.
                </div>
              </div>
              <div className="st-card st-stack">
                <div className="st-inline spread"><span className="st-strong-sm">Owner-gated mint</span><span className="st-flag ok">Runs today</span></div>
                <div className="st-muted-sm">Only the contract owner can mint; total issuance is public contract state, so supply stays attestable.</div>
              </div>
            </div>
          )}

          {tab === 'policy' && !utxoKind && (
            <div className="st-step">
              <div className="st-note">
                Live today: controlled issue and redeem under the issuer key. Toggling a designed
                control updates the target configuration.
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
                    <span className={`st-flag ${c.tone === 'success' ? 'ok' : c.tone === 'danger' ? 'err' : c.tone === 'warning' ? 'warn' : ''}`}>{c.status}</span>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'custody' && (
            <div className="st-step">
              <div className="st-two">
                <div className="st-card st-stack">
                  <span className="st-flag ok">What runs today</span>
                  <div className="st-strong">Current demonstration</div>
                  <div className="st-body-sm">A single issuer authority (<span className="mono">Ownable</span>). Every sensitive operation on this asset is authorised by one demonstration key.</div>
                </div>
                <div className="st-card st-stack">
                  <span className="st-flag">Target architecture</span>
                  <div className="st-strong">Institutional custody</div>
                  <div className="st-body-sm">
                    {utxoKind
                      ? kind === 'utxo'
                        ? 'Custody is your existing key stack. The coins are wallet-native, so HSM, MPC and multisig signing apply directly — nothing token-specific to integrate.'
                        : 'Custody means protecting the wallet keys AND the shielded note secrets — the witness material a local prover consumes when spending.'
                      : <>Your selected policy: <strong>{custodyName}</strong>. Integration with established custody, HSM, MPC, multisig and threshold-approval environments — shaped through extensive technical feedback from institutional custodians.</>}
                  </div>
                </div>
              </div>
              <div className="st-card raised st-stack">
                <div className="st-qa"><div>What authorises asset movement</div><p>Issuer operations: the issuer key. Transfers: the holder&apos;s {utxoKind ? 'wallet signature — no contract is involved' : 'key'}{confidential ? ' plus a zero-knowledge proof of the confidential state transition' : ''}{kind === 'zswap' ? ' (shielded spends are proved locally)' : ''}.</p></div>
                <div className="st-qa"><div>What must be protected</div><p>The issuer secret, holder keys{confidential ? ', and proof witness material' : ''}{kind === 'zswap' ? ', and the shielded note secrets' : ''}.</p></div>
                <div className="st-qa"><div>Proving trust boundary</div><p>Proofs are generated on the operator&apos;s machine — witness data never leaves it.</p></div>
              </div>
            </div>
          )}

          {tab === 'visibility' && (
            <div className="st-step">
              <div className="st-head-block tight">
                <h2>Who can see what?</h2>
                <p className="st-body-sm">
                  {shielded
                    ? 'Switch perspective — field-level visibility, exactly as the ledger enforces it.'
                    : 'On this token every perspective sees the same thing: everything. That symmetry is what the shielded types change.'}
                </p>
              </div>
              {shielded && (
                <div className="st-personas">
                  {(['public', 'issuer', 'alice', 'bob', 'auditor'] as const).map((p) => (
                    <button key={p} className={`st-tag${persona === p ? ' active' : ''}`} onClick={() => setPersona(p)}>
                      {{ public: 'Public observer', issuer: 'Issuer', alice: 'Alice', bob: 'Bob', auditor: 'Authorised auditor' }[p]}
                    </button>
                  ))}
                </div>
              )}
              {shielded && persona === 'auditor' && (
                <div className="st-note">
                  {confidential
                    ? 'A reviewer today sees the public view. Viewing-key disclosure for authorised reviewers is on the platform roadmap.'
                    : 'A reviewer sees the public view: commitments. Shielded UTXOs have no selective-disclosure mechanism — issuance is the attestable part.'}
                </div>
              )}
              {shielded && <div className="st-body-sm">{personaDesc[persona]}</div>}
              <div className="st-table">
                {matrixRows.map((m) => (
                  <div key={m.f} className="st-table-row st-matrix-grid">
                    <div className="st-strong-sm">{m.f}</div>
                    <Chip tone={m.tone}>{m.chip}</Chip>
                    <div>{m.note}</div>
                  </div>
                ))}
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
                    Every id is a real transaction on the connected chain; durations are measured.
                    {confidential && ' Transfer values appear in this log because this session holds every party\u2019s keys; the public ledger hides them.'}
                    {kind === 'zswap' && ' Transfer details appear in this log because this session holds every party\u2019s keys; the public ledger sees commitments.'}
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'compose' && (
            <div className="st-step">
              <blockquote className="st-quote">Privacy and institutional control follow the asset into the applications where it is used.</blockquote>
              <h2>What can this asset do next?</h2>
              <div className="st-two">
                <div className="st-card st-stack"><div className="st-inline spread"><span className="st-strong-sm">{utxoKind ? 'Return through the issuer' : 'Redeem through the issuer'}</span><span className="st-flag ok">Runs today</span></div><div className="st-muted-sm">{utxoKind ? 'Bearer coins have no burn — redemption is a transfer back to the issuer, exercisable in Issue & redeem.' : 'Burn against the issuer — exercisable in Issue & redeem.'}</div></div>
                <div className="st-card st-stack"><div className="st-inline spread"><span className="st-strong-sm">Settle a transfer</span><span className="st-flag ok">Runs today</span></div><div className="st-muted-sm">{confidential ? 'Value-private transfer on public infrastructure.' : kind === 'zswap' ? 'Fully-shielded wallet-level transfer on public infrastructure.' : kind === 'utxo' ? 'Public wallet-level transfer — the same rails NIGHT moves on.' : 'Public transfer on public infrastructure.'}</div></div>
                <div className="st-card st-stack"><div className="st-inline spread"><span className="st-strong-sm">Subscribe to a regulated fund</span><span className="st-flag">Planned</span></div><div className="st-muted-sm">The tokenised money-market fund composition; this token is its cash leg.</div></div>
                <div className="st-card st-stack"><div className="st-inline spread"><span className="st-strong-sm">Post as collateral</span><span className="st-flag">Planned</span></div><div className="st-muted-sm">Collateral designation for a fund or security position.</div></div>
                <div className="st-card st-stack"><div className="st-inline spread"><span className="st-strong-sm">Private delivery versus payment</span><span className="st-flag">Planned</span></div><div className="st-muted-sm">Offers-based atomic settlement — private quantities, approved counterparties.</div></div>
                <div className="st-card st-stack"><div className="st-inline spread"><span className="st-strong-sm">Integrate with an application</span><span className="st-flag warn">Requires integration</span></div><div className="st-muted-sm">Contract-to-contract calls carry unshielded data today — no value movement across calls.</div></div>
              </div>
            </div>
          )}

          {tab === 'assurance' && (
            <div className="st-step">
              <div className="st-table">
                <div className="st-table-title"><span>Assurance summary</span><span className="st-muted-sm">Statuses come from the implementation</span></div>
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

          {tab === 'tech' && (
            <div className="st-step">
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
                        {k === 'proof' && 'Local — witness data never leaves this machine'}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="st-table">
                <div className="st-table-title"><span>Configuration</span></div>
                <div className="st-table-row st-brief-grid"><div className="st-kcell muted">Endpoints</div><div>Defined once, in <span className="mono">packages/network</span></div></div>
                <div className="st-table-row st-brief-grid"><div className="st-kcell muted">Pinned stack</div><div>RC3 set moves together — <span className="mono">ops/versions.lock.json</span></div></div>
                <div className="st-table-row st-brief-grid"><div className="st-kcell muted">Module</div><div><span className="mono">@openzeppelin/compact-contracts 0.3.0-alpha.2</span>{confidential ? ' — patched (typed Jubjub scalars, Compact 0.25)' : ''}</div></div>
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
