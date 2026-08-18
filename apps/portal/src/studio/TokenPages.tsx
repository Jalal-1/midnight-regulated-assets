/**
 * The token management dashboard (/tokens) and the per-token page
 * (/tokens/<address>). One live session at a time:
 *
 *  - The token deployed in THIS browser session is fully operable — issue,
 *    transfer, redeem/return run as real transactions through the session's
 *    wallets.
 *  - Every other registered token renders as a CHAIN VIEW: name, supply and
 *    holders read live from the indexer, privacy profile from the model. Its
 *    session wallets are gone, so operations are not offered — the page says
 *    so plainly instead of showing dead buttons.
 */

import { useEffect, useState } from 'react';

import { currentNetwork, navigate } from '@mra/lab-shell';

import { readCftView } from '../labs/confidentialToken.ts';
import { readPublicView } from '../labs/publicToken.ts';
import { readUtxoView } from '../labs/utxoTokens.ts';
import { assuranceRows, type TokenType } from './config.ts';
import ExposureChart from './ExposureChart.tsx';
import { getToken, listTokens, removeToken, type RegisteredToken } from './tokenRegistry.ts';
import { PERSONA_LABEL, type StudioChain, type TokenKind } from './useStudioChain.ts';

const fmt = (units: bigint) =>
  (Number(units) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const parseUnits = (raw: string): bigint => {
  const n = parseFloat(raw.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? BigInt(Math.round(n * 100)) : 0n;
};

const KIND_LABEL: Record<TokenKind, string> = {
  utxo: 'Unshielded UTXO token',
  public: 'Unshielded contract token',
  zswap: 'ZSwap shielded UTXO token',
  confidential: 'Shielded contract token (CFT)',
};

const KIND_TOKEN_TYPE: Record<TokenKind, TokenType> = {
  utxo: 'utxo-unshielded',
  public: 'contract-unshielded',
  zswap: 'zswap-shielded',
  confidential: 'contract-confidential',
};

// ---- /tokens — the token management dashboard ---------------------------------------

export function TokenList({ chain }: { readonly chain: StudioChain }) {
  const network = currentNetwork().networkId;
  const tokens = listTokens(network);

  return (
    <div className="st-center">
      <div className="st-compare">
        <div className="st-head-block">
          <span className="st-overline">Token dashboard · {network === 'stagenet' ? 'Stagenet' : 'Local development'}</span>
          <h1>Your tokens</h1>
          <p>
            Every token deployed from this browser on this network. The current session&apos;s
            token is fully operable; earlier deployments open as live chain views.
          </p>
        </div>
        <div className="tk-grid">
          {tokens.map((t) => {
            const live = chain.address === t.address;
            return (
              <button key={t.address} className="tk-card" onClick={() => navigate(`/tokens/${t.address}`)}>
                <span className="st-inline spread">
                  <strong>{t.name}</strong>
                  <span className={`st-flag ${live ? 'ok' : ''}`}>{live ? 'Live session' : 'Chain view'}</span>
                </span>
                <span className="tk-meta mono">{t.symbol} · {t.address.slice(0, 10)}…</span>
                <span className="st-muted-sm">{KIND_LABEL[t.kind]}</span>
                <span className="st-muted-xs">deployed {new Date(t.deployedAt).toLocaleString()}</span>
              </button>
            );
          })}
          <button className="tk-card tk-new" onClick={() => navigate('/studio')}>
            <strong>+ Deploy a new token</strong>
            <span className="st-muted-sm">Choose a token type and walk the guided issuance.</span>
          </button>
        </div>
        {tokens.length === 0 && (
          <p className="st-muted-sm">
            Nothing deployed on this network from this browser yet — deploy your first token to
            populate the dashboard.
          </p>
        )}
      </div>
    </div>
  );
}

// ---- /tokens/<address> — one token's page -------------------------------------------

interface ChainView {
  readonly symbol: string;
  readonly supply: bigint;
  readonly holders: number | null;
  readonly registered: number | null;
}

function useChainView(token: RegisteredToken | undefined, live: boolean) {
  const [view, setView] = useState<ChainView | null | 'unreachable'>(null);
  useEffect(() => {
    if (!token || live) return;
    let alive = true;
    const tick = async () => {
      try {
        if (token.kind === 'public') {
          const v = await readPublicView(token.address);
          if (alive && v) setView({ symbol: v.symbol, supply: v.totalSupply, holders: v.holdings.length, registered: null });
          else if (alive) setView('unreachable');
        } else if (token.kind === 'confidential') {
          const v = await readCftView(token.address);
          if (alive && v) setView({ symbol: v.symbol, supply: v.totalSupply, holders: null, registered: v.registered.length });
          else if (alive) setView('unreachable');
        } else {
          const v = await readUtxoView(token.kind, token.address);
          if (alive && v) setView({ symbol: v.symbol, supply: v.minted, holders: null, registered: null });
          else if (alive) setView('unreachable');
        }
      } catch {
        if (alive) setView('unreachable');
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 10_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [token, live]);
  return view;
}

export function TokenPage({ chain, address }: { readonly chain: StudioChain; readonly address: string }) {
  const token = getToken(address);
  const live = chain.address === address;
  const kind: TokenKind = live ? chain.kind : (token?.kind ?? 'public');
  const utxoKind = kind === 'utxo' || kind === 'zswap';
  const confidential = kind === 'confidential';
  const shielded = kind === 'zswap' || confidential;
  const chainView = useChainView(token, live);
  const busy = chain.busy;
  const holders = ['alice', 'bob'] as const;
  const [forms, setForms] = useState({
    issueAmt: '1,000.00', issueTo: 'alice' as 'alice' | 'bob',
    xferAmt: '250.00', xferFrom: 'alice' as 'alice' | 'bob', xferTo: 'bob' as 'alice' | 'bob',
    redeemAmt: '500.00', redeemFrom: 'alice' as 'alice' | 'bob',
  });

  if (!token && !live) {
    return (
      <div className="st-center"><div className="st-compare">
        <div className="st-head-block"><h1>Unknown token</h1>
          <p>No token with this address is registered in this browser.</p></div>
        <button className="st-btn primary" onClick={() => navigate('/tokens')}>← All tokens</button>
      </div></div>
    );
  }

  const name = live ? (token?.name ?? chain.view?.symbol ?? 'Token') : token!.name;
  const symbol = live ? (chain.view?.symbol ?? token?.symbol ?? '') : (chainView !== null && chainView !== 'unreachable' ? chainView.symbol : token!.symbol);
  const supply = live ? (chain.view?.totalSupply ?? 0n) : chainView !== null && chainView !== 'unreachable' ? chainView.supply : null;

  return (
    <div className="st-center">
      <div className="st-compare tk-page">
        <div className="st-inline spread">
          <button className="st-btn ghost sm" onClick={() => navigate('/tokens')}>← All tokens</button>
          <span className={`st-flag ${live ? 'ok' : ''}`}>{live ? 'Live session' : 'Chain view — read-only'}</span>
        </div>
        <div className="st-head-block tight">
          <h1>{name} <span className="tk-sym mono">{symbol}</span></h1>
          <p className="st-muted-sm mono">{KIND_LABEL[kind]} · {address}</p>
        </div>

        {!live && token && kind !== 'confidential' && currentNetwork().networkId === 'undeployed' && chainView !== 'unreachable' && (
          <div className="st-card st-cta">
            <div>
              <div className="st-strong">Connect &amp; operate</div>
              <div className="st-body-sm">
                Rebuilds the demo persona wallets from their seeds and attaches to this contract —
                mint, transfer and return then run for real. Attaching moves the live session to
                this token.
              </div>
            </div>
            <button
              className="st-btn accent sm"
              disabled={busy}
              onClick={() => void chain.attach({ address, kind: token.kind, tokenType: token.tokenType })}
            >
              {busy ? 'Connecting…' : 'Connect & operate →'}
            </button>
          </div>
        )}
        {!live && busy && chain.opStage && <div className="st-workbox">{chain.opStage}</div>}
        {!live && chain.opErr && <div className="st-errbox">{chain.opErr}</div>}
        {!live && kind === 'confidential' && (
          <div className="st-note">
            Confidential tokens cannot be operated after their session ends: spend proofs need the
            wallet-side plaintext balances, which live only in the deploying session. State below
            is read live from the indexer.
          </div>
        )}
        {!live && token && kind !== 'confidential' && currentNetwork().networkId === 'stagenet' && (
          <div className="st-note">
            Reconnecting on Stagenet needs the funded seeds this token was deployed with — seeds
            never persist. State below is read live from the indexer.
          </div>
        )}
        {chainView === 'unreachable' && !live && (
          <div className="st-errbox">
            The contract does not answer on this network — a local chain reset removes deployed
            contracts. <button className="link" onClick={() => { removeToken(address); navigate('/tokens'); }}>Remove from the list</button>
          </div>
        )}

        <div className="st-tiles">
          <div className="st-tile"><span>{utxoKind ? 'Total issued' : 'Circulating supply'} <em>· public</em></span><strong>{supply === null ? '—' : fmt(supply)} <small>{symbol}</small></strong></div>
          {live && <div className="st-tile"><span>Issued this session</span><strong>{fmt(chain.issuedTotal)}</strong></div>}
          {live && <div className="st-tile"><span>{utxoKind ? 'Returned this session' : 'Redeemed this session'}</span><strong>{fmt(chain.redeemedTotal)}</strong></div>}
          {confidential && (live ? chain.view?.registeredCount !== null : true) && (
            <div className="st-tile"><span>Registered participants <em>· public</em></span><strong>{live ? chain.view?.registeredCount ?? 0 : chainView !== null && chainView !== 'unreachable' ? chainView.registered ?? '—' : '—'}</strong></div>
          )}
          {kind === 'public' && (
            <div className="st-tile"><span>Holders <em>· public</em></span><strong>{live ? chain.view?.holders?.length ?? 0 : chainView !== null && chainView !== 'unreachable' ? chainView.holders ?? '—' : '—'}</strong></div>
          )}
        </div>

        {live && (
          <>
            {chain.sponsored && (
              <div className="st-note">
                Customer fees are issuer-sponsored. Alice and Bob hold no DUST; they sign and bind
                their own transactions, and ACME Bank attaches the fee and submits.
              </div>
            )}
            {chain.opErr && <div className="st-errbox">{chain.opErr}</div>}
            {busy && (
              <div className="st-workbox">
                {chain.opStage ?? 'Working — a proved call takes ~18 s (proving locally, block inclusion the rest). Do not reload.'}
              </div>
            )}
            {!busy && chain.lastOp && (
              <div className="st-okbox">
                {chain.lastOp.label} · tx {chain.lastOp.tx} · completed in {(chain.lastOp.ms / 1000).toFixed(1)} s.
              </div>
            )}
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
            </div>
          </>
        )}

        <div className="st-head-block tight"><h2 className="st-h2">Privacy profile</h2></div>
        <ExposureChart kind={kind} />

        {live && (
          <details className="st-fold">
            <summary>Activity (this session)</summary>
            <div className="st-fold-body">
              {chain.activity.length === 0 ? (
                <div className="st-empty">No activity yet.</div>
              ) : (
                chain.activity.map((ev, i) => (
                  <div key={i} className="st-actrow">
                    <span className="st-mono-xs">{ev.t}</span>
                    <span className="st-grow">{ev.label} <span className="st-muted-xs">{ev.note}</span></span>
                    <span className="st-mono-xs">{ev.tx}</span>
                  </div>
                ))
              )}
            </div>
          </details>
        )}
        <details className="st-fold">
          <summary>Assurance — what is verified where</summary>
          <div className="st-fold-body st-table plain">
            {assuranceRows(currentNetwork().networkId === 'stagenet' ? 'stagenet' : 'local', KIND_TOKEN_TYPE[kind]).map((a) => (
              <div key={a.k} className="st-table-row st-assur-grid">
                <div className="st-kcell">{a.k}</div>
                <div>{a.v}</div>
                <span className="st-flag">{a.chip}</span>
              </div>
            ))}
          </div>
        </details>
        <details className="st-fold">
          <summary>Technical details</summary>
          <div className="st-fold-body st-stack">
            <div className="st-muted-sm">Contract address</div>
            <div className="st-mono-xs">{address}</div>
            {token?.tokenType && (
              <>
                <div className="st-muted-sm">Native token type (rawTokenType)</div>
                <div className="st-mono-xs">{token.tokenType}</div>
              </>
            )}
            <div className="st-muted-sm">Model: {KIND_LABEL[kind]} · Network: {currentNetwork().networkId}</div>
          </div>
        </details>
      </div>
    </div>
  );
}
