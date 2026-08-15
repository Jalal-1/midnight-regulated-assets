/**
 * Standards & assurance — who builds the token standards, exactly what is
 * pinned, what is patched, what the compiler cannot do yet, and what has and
 * has NOT been audited. This page exists so no other page has to soften those
 * facts to stay readable.
 */

import { useEffect } from 'react';

import { ASSET_MODELS } from '@mra/asset-models';
import { SiteNav, StatusBadge } from '@mra/lab-shell';

export default function Standards() {
  useEffect(() => {
    document.title = 'Standards & assurance — Midnight regulated assets';
  }, []);

  return (
    <div className="portal-page">
      <SiteNav />
      <div className="portal-inner prose">
        <header className="portal-hero left">
          <span className="overline">Standards &amp; assurance</span>
          <h1>What these examples are built on — exactly</h1>
        </header>

        <h2>OpenZeppelin&apos;s role</h2>
        <p>
          OpenZeppelin is designing and auditing the Compact token standards used by these
          examples — the access-control, fungible-token, confidential-token, and multisig modules
          this repository composes. Design input and an audit programme are not the same thing as
          a completed audit of the code pinned here, and this page never conflates them.
        </p>

        <h2>Audit status</h2>
        <p>
          <strong>
            No completed, applicable audit exists for the version pinned in this repository
          </strong>{' '}
          (<span className="mono">@openzeppelin/compact-contracts 0.3.0-alpha.2</span>). It is
          alpha software with moving APIs, and one example additionally applies a local
          compatibility patch. Nothing on this portal describes any of it as audited or
          production-ready.
        </p>

        <h2>The pinned toolchain</h2>
        <p>
          The full dependency set moves together and is recorded in{' '}
          <span className="mono">ops/versions.lock.json</span>: Compact compiler 0.33.0-rc.2
          (language 0.25.0), ledger 9.1.0.0-rc.3, node 2.0.0-rc.4, indexer 4.4.0-pre-alpha.16,
          proof server 9.0.0-rc.5_experimental, midnight-js 5.0.0-beta.4, wallet-sdk 2.0.0-beta.2.
          The compiler self-reports its expected ledger and runtime versions, and those
          self-reports are re-checked on every toolchain change.
        </p>

        <h2>The local compatibility patch (confidential token)</h2>
        <p>
          OpenZeppelin alpha.2 predates Compact language 0.25&apos;s typed curve scalars, so the
          confidential-token modules do not compile on the pinned toolchain unmodified. This
          repository applies a documented patch —{' '}
          <span className="mono">.yarn/patches/@openzeppelin-compact-contracts-*.patch</span>,
          applied automatically on install:
        </p>
        <ul>
          <li>
            16 mechanical <span className="mono">as JubjubScalar</span> casts at elliptic-curve
            call sites (safe by the modules&apos; own hash-to-scalar discipline: every scalar is
            already reduced below the Jubjub subgroup order);
          </li>
          <li>
            one rename (<span className="mono">ecNeg → ecNegViaOrder</span>) to avoid a collision
            with a circuit the 0.25 standard library gained.
          </li>
        </ul>
        <p>
          Both changes are type-level; no cryptographic behaviour changes. The full reasoning and
          verification live in the field notes entry of 2026-08-15. The patch is dropped the day
          OpenZeppelin ships a language-0.25-ready release — and a patched alpha dependency is,
          by definition, not production-ready.
        </p>

        <h2>Known compiler limitation</h2>
        <p>
          With <span className="mono">--feature-zkir-v3</span>, compactc 0.33.0-rc.2 fails on the
          confidential-token composition with an internal error
          (<span className="mono">cannot-happen, zkir-v3-passes.ss:558</span>). That contract is
          therefore compiled without the flag — a per-contract, marked opt-out in{' '}
          <span className="mono">ops/redeploy.sh</span> — and the experimental proof server
          accepts both IR versions (measured, ~0.3s per proof either way). The flag returns when
          the compiler is fixed.
        </p>

        <h2>Per-model implementation status</h2>
        <table className="standards-table">
          <thead>
            <tr>
              <th scope="col">Model</th>
              <th scope="col">Implementation</th>
              <th scope="col">Verification</th>
              <th scope="col">Audit status</th>
            </tr>
          </thead>
          <tbody>
            {ASSET_MODELS.map((m) => (
              <tr key={m.id}>
                <th scope="row">{m.plainName}</th>
                <td>{m.standards.implementation}</td>
                <td>
                  <StatusBadge status={m.verification} />
                </td>
                <td>{m.standards.auditStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>Custody and authorisation assumptions</h2>
        <p>
          The contract-token examples authorise callers with witness secrets bound in-circuit
          (accountId = H(secret)), gated by OpenZeppelin Ownable — a single-secret control. The
          pinned package ships ECDSA Signer and multisig modules (2-of-3 capable) that are the
          intended path to threshold issuer control, but they are not composed into these
          examples yet, and no claim of multisig, 2-of-3, recovery, or regulator-viewing
          capability is made anywhere on this portal for the current code. Proving is local by
          default on every network: witness material reaches the operator&apos;s own proof server
          and nothing beyond it.
        </p>

        <h2>Where the evidence lives</h2>
        <ul>
          <li>
            <span className="mono">ops/versions.lock.json</span> — the pin set, self-reports, and
            docker tags
          </li>
          <li>
            <span className="mono">docs/field-notes.md</span> — every non-obvious failure and fix,
            dated
          </li>
          <li>
            <span className="mono">.yarn/patches/</span> — the compatibility patch, byte for byte
          </li>
          <li>
            <span className="mono">apps/tokenised-deposit/</span> — contracts and lifecycle
            scripts for both working models
          </li>
        </ul>
      </div>
    </div>
  );
}
