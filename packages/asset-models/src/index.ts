/**
 * THE asset-model registry — the single authoritative description of every
 * regulated-asset model this repo covers. Comparison tables, status badges,
 * homepage cards, lab routes, solution pages, and roadmap entries all render
 * FROM this file; nothing else may restate these facts.
 *
 * Truthfulness rules (enforced by review, stated here so they are findable):
 *  - Every status value must be backed by code, tests, or field notes in this
 *    repository. Optimistic labels are bugs.
 *  - "Demonstrated on localnet" ≠ "Verified on Stagenet". Never conflate.
 *  - "Designed for compatibility" (with HSM/MPC/multisig/threshold policies)
 *    ≠ "Integration-tested" ≠ "Custodian-validated". The custody mechanisms
 *    themselves are NOT interchangeable: an HSM protects or operates on key
 *    material; MPC/TSS distributes cryptographic operations; multisig requires
 *    multiple independent authorisations; 2-of-3 is a threshold POLICY that may
 *    be enforced through any of them or through operational controls.
 *  - Proof-based authorisation may depend on note secrets or witness material
 *    rather than a conventional signing key — which changes what an HSM or MPC
 *    system would even need to protect.
 */

// --- Status vocabulary ------------------------------------------------------------

export type VerificationStatus =
  | 'Demonstrated on localnet'
  | 'Verified on Stagenet'
  | 'Not demonstrated';

export type CapabilityStatus =
  | 'Implemented'
  | 'Designed for compatibility'
  | 'Integration-tested'
  | 'Custodian-validated'
  | 'Requires adaptation'
  | 'In development'
  | 'Under investigation'
  | 'Not integrated'
  | 'Not implemented';

export type Readiness = 'Not production-ready' | 'Production-ready';

export interface CapabilityClaim {
  readonly status: CapabilityStatus;
  /** One sentence of evidence or caveat — rendered next to the badge. */
  readonly note: string;
}

// --- The model shape -----------------------------------------------------------------

export interface VisibilityProfile {
  readonly balances: string;
  readonly amounts: string;
  readonly counterparties: string;
  readonly supply: string;
}

/** What each participant in the standard cast can actually see. */
export interface PartyView {
  readonly issuer: string;
  readonly alice: string;
  readonly bob: string;
  /** 'Not implemented' when no differentiated regulator mechanism exists. */
  readonly regulator: string;
  readonly publicObserver: string;
}

export interface AssetModel {
  readonly id: string;
  readonly canonicalName: string;
  readonly plainName: string;
  readonly stateModel: string;
  readonly summary: string;

  readonly visibility: VisibilityProfile;
  /** Row per disclosed fact → what each party sees. Drives the visibility matrix. */
  readonly partyViews: readonly { readonly fact: string; readonly views: PartyView }[];

  readonly issuerControls: readonly string[];
  readonly authorisationModel: string;
  readonly keyMaterial: string;
  readonly provingBoundary: string;
  readonly regulatoryDisclosure: string;

  readonly custody: {
    readonly hsm: CapabilityClaim;
    readonly mpc: CapabilityClaim;
    readonly multisig: CapabilityClaim;
    readonly thresholdPolicy: CapabilityClaim;
    readonly integration: CapabilityClaim;
  };

  readonly verification: VerificationStatus;
  readonly readiness: Readiness;
  readonly standards: {
    /** e.g. "OpenZeppelin compact-contracts 0.3.0-alpha.2 (patched)" or "none". */
    readonly implementation: string;
    /** NEVER claims an audit that has not completed. */
    readonly auditStatus: string;
  };
  readonly limitations: readonly string[];
  /** Portal route of the lab or honest status page. */
  readonly route: string;
  /** Repo-relative source pointers. */
  readonly source: readonly string[];
}

// --- Shared truthful fragments ---------------------------------------------------------

const OZ_NOT_AUDITED =
  'No completed, applicable audit exists for the pinned version. OpenZeppelin is designing ' +
  'the Compact token standards used here and audits are part of that programme; alpha and ' +
  'patched-alpha code must not be described as audited.';

const WITNESS_SECRET_CUSTODY_NOTE =
  'Authorisation binds accountId = H(secret) inside the circuit: the sensitive item is a raw ' +
  '32-byte witness secret, not an ECDSA signing key, so conventional HSM/MPC signing flows do ' +
  'not apply as-is. OpenZeppelin’s Compact multisig/Signer modules (ECDSA, 2-of-3) exist in ' +
  'the pinned package but are not composed into this example.';

// --- The registry ------------------------------------------------------------------------

export const ASSET_MODELS: readonly AssetModel[] = [
  {
    id: 'public-account-token',
    canonicalName: 'Public account-based contract token',
    plainName: 'Public contract token',
    stateModel: 'Account balances in public contract state (Compact ledger Map)',
    summary:
      'The transparency baseline: an owner-controlled fungible token whose every balance, ' +
      'transfer, and the total supply sit in public contract state. Issuer control works; ' +
      'privacy does not exist.',
    visibility: {
      balances: 'Public — anyone can enumerate every holder and balance from the indexer',
      amounts: 'Public — every transfer amount is visible',
      counterparties: 'Public — sender and recipient account ids on every transfer',
      supply: 'Public',
    },
    partyViews: [
      {
        fact: 'Balances (all holders)',
        views: {
          issuer: 'Full view',
          alice: 'Full view — including other customers',
          bob: 'Full view — including other customers',
          regulator: 'Same as public (no differentiated mechanism)',
          publicObserver: 'Full view — enumerable without a wallet or key',
        },
      },
      {
        fact: 'Transfer amounts',
        views: {
          issuer: 'Visible',
          alice: 'Visible',
          bob: 'Visible',
          regulator: 'Same as public',
          publicObserver: 'Visible',
        },
      },
      {
        fact: 'Counterparties',
        views: {
          issuer: 'Visible',
          alice: 'Visible',
          bob: 'Visible',
          regulator: 'Same as public',
          publicObserver: 'Visible',
        },
      },
      {
        fact: 'Total supply',
        views: {
          issuer: 'Visible',
          alice: 'Visible',
          bob: 'Visible',
          regulator: 'Same as public',
          publicObserver: 'Visible',
        },
      },
    ],
    issuerControls: ['Owner-gated mint', 'Owner-gated burn (from any account)'],
    authorisationModel:
      'Proof-based: circuits authenticate the caller by binding accountId = H(witness secret). ' +
      'Owner gating via OpenZeppelin Ownable on the same identity scheme.',
    keyMaterial: '32-byte witness secret per participant (issuer and each holder)',
    provingBoundary:
      'Proofs generated by the LOCAL proof server; the witness secret reaches that local ' +
      'process and nothing beyond it.',
    regulatoryDisclosure:
      'Trivially satisfied and undifferentiated: the regulator sees exactly what the public sees.',
    custody: {
      hsm: { status: 'Requires adaptation', note: WITNESS_SECRET_CUSTODY_NOTE },
      mpc: { status: 'Requires adaptation', note: WITNESS_SECRET_CUSTODY_NOTE },
      multisig: {
        status: 'Requires adaptation',
        note:
          'OpenZeppelin Compact ships ECDSA Signer/multisig modules in the pinned package; this ' +
          'example gates on single-secret Ownable and has not composed them.',
      },
      thresholdPolicy: {
        status: 'Requires adaptation',
        note: '2-of-3 would come from composing the OZ multisig modules; not composed here.',
      },
      integration: {
        status: 'Not integrated',
        note: 'No custody-system integration has been performed or validated for this example.',
      },
    },
    verification: 'Demonstrated on localnet',
    readiness: 'Not production-ready',
    standards: {
      implementation:
        'OpenZeppelin compact-contracts 0.3.0-alpha.2 — FungibleToken + Ownable (unpatched modules)',
      auditStatus: OZ_NOT_AUDITED,
    },
    limitations: [
      'Everything is public — fails any privacy requirement by construction (that is what it demonstrates)',
      'Single-secret issuer control (Ownable), not a threshold policy',
      'Alpha dependency; APIs still moving',
    ],
    route: '/labs/public-token',
    source: [
      'apps/tokenised-deposit/contract/public-token.compact',
      'apps/tokenised-deposit/src/design-options/public-token.ts',
    ],
  },

  {
    id: 'confidential-account-token',
    canonicalName: 'Confidential account-based contract token (CFT)',
    plainName: 'Confidential contract token',
    stateModel:
      'Account balances as ElGamal ciphertexts (Jubjub curve points) in contract state; ' +
      'public supply cell via the PublicSupply extension',
    summary:
      'The closest demonstrated fit for a tokenised deposit: balances and transfer amounts are ' +
      'encrypted, the issuer keeps mint/burn control, and total supply stays public so an ' +
      'issuer can attest circulating supply.',
    visibility: {
      balances: 'Encrypted — on-chain cells are ElGamal ciphertexts; only the key holder can read them',
      amounts: 'Hidden — transfer amounts never appear on chain',
      counterparties: 'Public — sender and recipient account ids are visible on each transfer',
      supply: 'Public BY DESIGN — and each mint/redeem amount is visible as a supply delta',
    },
    partyViews: [
      {
        fact: 'Own balance',
        views: {
          issuer: 'Own balance only (wallet-side plaintext, proof-verified)',
          alice: 'Own balance (wallet-side plaintext, proof-verified)',
          bob: 'Own balance (wallet-side plaintext, proof-verified)',
          regulator: 'Not implemented — no viewing-key mechanism in the pinned module',
          publicObserver: 'Ciphertext only — not a readable number',
        },
      },
      {
        fact: 'Others’ balances',
        views: {
          issuer: 'Ciphertext only — issuing does not grant read access',
          alice: 'Ciphertext only',
          bob: 'Ciphertext only',
          regulator: 'Not implemented',
          publicObserver: 'Ciphertext only',
        },
      },
      {
        fact: 'Transfer amounts',
        views: {
          issuer: 'Hidden (unless a party to the transfer)',
          alice: 'Visible for own transfers',
          bob: 'Visible for own transfers (memo)',
          regulator: 'Not implemented',
          publicObserver: 'Hidden',
        },
      },
      {
        fact: 'Counterparties',
        views: {
          issuer: 'Visible (public)',
          alice: 'Visible (public)',
          bob: 'Visible (public)',
          regulator: 'Same as public',
          publicObserver: 'Visible — account ids on every transfer',
        },
      },
      {
        fact: 'Total supply',
        views: {
          issuer: 'Visible (public)',
          alice: 'Visible (public)',
          bob: 'Visible (public)',
          regulator: 'Same as public',
          publicObserver: 'Visible — including each mint/redeem delta',
        },
      },
    ],
    issuerControls: [
      'Owner-gated mint (paired with public supply accounting)',
      'Approval-based burnFrom — not unilateral seizure',
    ],
    authorisationModel:
      'Proof-based: caller identity from a witness secret (accountId = H(SK)); balance claims ' +
      'verified in-circuit against the ciphertexts (assertDecryptsTo). Owner gating via Ownable.',
    keyMaterial:
      'Per participant: a 32-byte identity secret, a 32-byte ElGamal decryption secret, fresh ' +
      'CSPRNG randomness per operation, and wallet-side plaintext balance tracking. Randomness ' +
      'freshness and plaintext custody are WALLET obligations the contract cannot enforce.',
    provingBoundary:
      'Proofs generated by the LOCAL proof server; witness material (secrets, amounts, ' +
      'randomness) reaches that local process and nothing beyond it.',
    regulatoryDisclosure:
      'Not implemented: the pinned module is single-receiver with no viewing-key or auditor ' +
      'mechanism. A confidential-supply/auditor variant is a named OpenZeppelin direction, not ' +
      'shipped code.',
    custody: {
      hsm: {
        status: 'Requires adaptation',
        note:
          'Witness secrets and per-operation randomness are proof inputs, not signing keys; an ' +
          'HSM would need to protect witness material, which is not a standard HSM operation.',
      },
      mpc: {
        status: 'Requires adaptation',
        note: 'Distributing witness-based proving across MPC parties is unexplored in this repo.',
      },
      multisig: {
        status: 'Requires adaptation',
        note:
          'Issuer gate is single-secret Ownable. OZ Compact multisig modules exist in the pinned ' +
          'package but are not composed with the CFT here.',
      },
      thresholdPolicy: {
        status: 'Requires adaptation',
        note: 'No 2-of-3 policy is enforced in this example.',
      },
      integration: {
        status: 'Not integrated',
        note:
          'The broader product architecture has been shaped by extensive custodian feedback and is ' +
          'designed for compatibility with HSM/MPC/multisig/threshold environments; this specific ' +
          'example has not been integrated or validated with any custody system.',
      },
    },
    verification: 'Demonstrated on localnet',
    readiness: 'Not production-ready',
    standards: {
      implementation:
        'OpenZeppelin compact-contracts 0.3.0-alpha.2, PATCHED for Compact language 0.25 ' +
        '(16 typed-scalar casts + 1 rename; .yarn/patches/, field notes 2026-08-15) — ' +
        'ConfidentialFungibleToken + ConfidentialFungibleTokenPublicSupply + Ownable. Compiled ' +
        'WITHOUT --feature-zkir-v3 due to a documented internal compiler error.',
      auditStatus: OZ_NOT_AUDITED,
    },
    limitations: [
      'Counterparty graph is public; full graph privacy is out of scope for this model',
      'Each mint/redeem amount is visible as a public supply delta (by design of PublicSupply)',
      'No regulator viewing mechanism (single-receiver module)',
      'Recipients must register an encryption key on-chain before they can receive',
      'Depends on a locally patched alpha; ZKIR v3 disabled for this contract',
      'Wallet layer is load-bearing: randomness reuse leaks amount differences',
    ],
    route: '/labs/confidential-token',
    source: [
      'apps/tokenised-deposit/contract/confidential-token.compact',
      'apps/tokenised-deposit/src/design-options/confidential-token.ts',
      '.yarn/patches/',
    ],
  },

  {
    id: 'native-unshielded',
    canonicalName: 'Native unshielded UTXO asset',
    plainName: 'Native public asset',
    stateModel: 'Ledger-native unshielded UTXOs (the representation NIGHT itself uses)',
    summary:
      'A token minted as a first-class unshielded ledger asset: maximum interoperability and ' +
      'the simplest custody story, but no issuer control after mint and no privacy.',
    visibility: {
      balances: 'Public (UTXO set)',
      amounts: 'Public',
      counterparties: 'Public',
      supply: 'Public',
    },
    partyViews: [
      {
        fact: 'All activity',
        views: {
          issuer: 'Visible',
          alice: 'Visible',
          bob: 'Visible',
          regulator: 'Same as public',
          publicObserver: 'Visible',
        },
      },
    ],
    issuerControls: [
      'None after mint — no pause, no freeze, no allowlist (that absence is the point of demonstrating it)',
    ],
    authorisationModel: 'Signature-based: Schnorr or ECDSA over the unshielded UTXO (wallet-sdk keystore).',
    keyMaterial: 'Conventional signing key (Schnorr today; ECDSA supported by the keystore)',
    provingBoundary: 'No ZK proof required for plain transfers; standard transaction signing.',
    regulatoryDisclosure: 'Undifferentiated: public data.',
    custody: {
      hsm: {
        status: 'Designed for compatibility',
        note:
          'Signature-based authorisation over conventional keys is the case HSMs exist for; not ' +
          'exercised in this repo.',
      },
      mpc: { status: 'Designed for compatibility', note: 'Standard threshold-signature territory; not exercised here.' },
      multisig: { status: 'Under investigation', note: 'Ledger-level multisig support not yet exercised in this repo.' },
      thresholdPolicy: { status: 'Under investigation', note: 'Would ride on MPC or multisig above.' },
      integration: { status: 'Not integrated', note: 'No lifecycle exists in this repo yet.' },
    },
    verification: 'Not demonstrated',
    readiness: 'Not production-ready',
    standards: {
      implementation: 'None yet in this repo (ledger-native; no OpenZeppelin module involved)',
      auditStatus: 'Not applicable — no contract code in this repo for this model.',
    },
    limitations: [
      'No lifecycle implemented in this repo yet — planned as the remaining M2 design option',
      'No issuer controls by construction',
    ],
    route: '/models/native-unshielded',
    source: ['docs/products/tokenised-deposit.md'],
  },

  {
    id: 'native-shielded',
    canonicalName: 'Native shielded UTXO asset',
    plainName: 'Native private asset',
    stateModel: 'Zswap shielded UTXOs — on-chain commitments and nullifiers only',
    summary:
      'A bearer-style private asset at the ledger level: strong holder privacy, but issuer ' +
      'control and custody workflows are open problems for regulated use.',
    visibility: {
      balances: 'Hidden (commitments only)',
      amounts: 'Hidden',
      counterparties: 'Hidden (nullifiers unlink spends)',
      supply: 'Not publicly attestable per-asset in this repo’s demonstrations',
    },
    partyViews: [
      {
        fact: 'All activity',
        views: {
          issuer: 'Own coins only',
          alice: 'Own coins only',
          bob: 'Own coins only',
          regulator: 'Not implemented',
          publicObserver: 'Commitments and nullifiers — no balances, amounts, or parties',
        },
      },
    ],
    issuerControls: ['None demonstrated — no pause, freeze, or controlled redemption'],
    authorisationModel:
      'Proof-based: spending requires note secrets and a ZK proof; there is no conventional ' +
      'signing key for a custodian to hold.',
    keyMaterial: 'Zswap secret keys and note/witness material',
    provingBoundary: 'Local proof server; note secrets are proof inputs.',
    regulatoryDisclosure: 'Not implemented.',
    custody: {
      hsm: {
        status: 'Requires adaptation',
        note: 'The secret is note/witness material consumed by a prover, not a signing key an HSM operates on.',
      },
      mpc: { status: 'Under investigation', note: 'Threshold proving over note secrets is research territory.' },
      multisig: { status: 'Not integrated', note: 'No spend-policy layer exists at this level.' },
      thresholdPolicy: { status: 'Not integrated', note: 'No mechanism demonstrated.' },
      integration: { status: 'Not integrated', note: 'Deliberately sequenced last (M6) — not custody-compatible today.' },
    },
    verification: 'Not demonstrated',
    readiness: 'Not production-ready',
    standards: {
      implementation: 'None in this repo (ledger-native zswap; no OpenZeppelin module involved)',
      auditStatus: 'Not applicable — no contract code in this repo for this model.',
    },
    limitations: [
      'No lifecycle implemented in this repo (planned last, M6)',
      'Genesis shielded test assets exist on localnet, but no issuance/lifecycle demonstration',
      'Custody adaptation is the open problem, not an integration detail',
    ],
    route: '/models/native-shielded',
    source: ['docs/field-notes.md'],
  },

  {
    id: 'shielded-contract-token',
    canonicalName: 'Shielded (note-based) contract token',
    plainName: 'Shielded contract token',
    stateModel: 'Contract-managed shielded notes',
    summary:
      'The fully graph-private contract token. Upstream keeps its only implementation archived ' +
      'and marked not for production; this repo demonstrates nothing here and says so.',
    visibility: {
      balances: 'Hidden (by design of the model)',
      amounts: 'Hidden',
      counterparties: 'Hidden',
      supply: 'Unreliable in the archived upstream module — a named reason it is archived',
    },
    partyViews: [
      {
        fact: 'All activity',
        views: {
          issuer: 'Not demonstrated',
          alice: 'Not demonstrated',
          bob: 'Not demonstrated',
          regulator: 'Not implemented',
          publicObserver: 'Not demonstrated',
        },
      },
    ],
    issuerControls: [
      'None in the archived module: no custom spend logic, so no pause and no freeze (upstream’s own stated reason)',
    ],
    authorisationModel: 'Proof-based over note secrets (as archived upstream).',
    keyMaterial: 'Note secrets and witness material',
    provingBoundary: 'Local proof server (as with every model here).',
    regulatoryDisclosure: 'Not implemented.',
    custody: {
      hsm: { status: 'Not integrated', note: 'No working implementation to integrate.' },
      mpc: { status: 'Not integrated', note: 'No working implementation to integrate.' },
      multisig: { status: 'Not integrated', note: 'No working implementation to integrate.' },
      thresholdPolicy: { status: 'Not integrated', note: 'No working implementation to integrate.' },
      integration: { status: 'Not integrated', note: 'Upstream module is archived: "DO NOT USE IN PRODUCTION".' },
    },
    verification: 'Not demonstrated',
    readiness: 'Not production-ready',
    standards: {
      implementation:
        'OpenZeppelin keeps its ShieldedToken in archive/ — "archived until further notice, DO NOT ' +
        'USE IN PRODUCTION" (confirmed on main, 2026-08-13). Not consumed by this repo.',
      auditStatus: 'Not applicable — archived upstream, nothing pinned here.',
    },
    limitations: [
      'No implementation in this repo, deliberately (sequenced last, M6)',
      'Upstream cites missing spend controls and unreliable supply accounting',
    ],
    route: '/models/shielded-contract-token',
    source: ['docs/products/tokenised-deposit.md', 'ops/versions.lock.json'],
  },
];

export function getModel(id: string): AssetModel | undefined {
  return ASSET_MODELS.find((m) => m.id === id);
}

/** Models with a working, clickable lab. */
export function labModels(): readonly AssetModel[] {
  return ASSET_MODELS.filter((m) => m.route.startsWith('/labs/'));
}

/** Models with only an honest status page. */
export function statusPageModels(): readonly AssetModel[] {
  return ASSET_MODELS.filter((m) => m.route.startsWith('/models/'));
}
