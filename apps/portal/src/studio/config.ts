/**
 * Asset Studio configuration: the wizard's domain model.
 *
 * Content ported from the Asset Studio design spec, kept because it is
 * TRUTHFUL: every status string matches the asset-model registry and the
 * implementation. The studio records target configuration (custody policy,
 * designed controls) without pretending any of it is live — the only things
 * that deploy are the things that run today.
 *
 * Non-secret only. Config may persist to sessionStorage across the network-
 * switch reload; seeds and wallet material never appear here.
 */


export type TokenType =
  | 'utxo-unshielded'
  | 'contract-unshielded'
  | 'zswap-shielded'
  | 'contract-confidential'
  | 'contract-note';

export interface TokenDef {
  readonly id: TokenType;
  readonly name: string;
  /** One line that places it in Midnight's architecture. */
  readonly model: string;
  readonly desc: string;
  readonly usefulFor: string;
  /** Skimmable capability checklist — same rows on every card so trade-offs line up. */
  readonly features: Record<FeatureId, boolean>;
  readonly visibility: string;
  /** Deployable through this studio today. */
  readonly deployable: boolean;
  /** Quiet status line — plain text, not a badge. */
  readonly statusLine: string;
  readonly defaults: { name: string; symbol: string };
}

export type FeatureId = 'balances' | 'amounts' | 'parties' | 'supply' | 'controls' | 'native';

/** One checklist, every card — a checked box is a capability the token HAS. */
export const FEATURE_DEFS: readonly { id: FeatureId; label: string }[] = [
  { id: 'balances', label: 'Private balances' },
  { id: 'amounts', label: 'Private transfer amounts' },
  { id: 'parties', label: 'Private counterparties' },
  { id: 'supply', label: 'Publicly attestable issuance' },
  { id: 'controls', label: 'Issuer controls after issuance' },
  { id: 'native', label: 'Moves wallet-to-wallet like NIGHT' },
];

export const TOKEN_DEFS: readonly TokenDef[] = [
  {
    id: 'utxo-unshielded',
    name: 'Unshielded UTXO token',
    model: 'Native ledger asset · UTXO model — the representation NIGHT itself uses',
    desc: 'A native ledger asset. Coins move with plain signatures; no contract sits in the path.',
    usefulFor: 'Settlement assets, exchange-grade fungibility, maximum interoperability.',
    features: { balances: false, amounts: false, parties: false, supply: true, controls: false, native: true },
    visibility: 'Fully public: every coin, amount and counterparty is visible to everyone.',
    deployable: true,
    statusLine: 'Working example — owner-gated mint, then wallet-level transfers.',
    defaults: { name: 'ACME Cash', symbol: 'aCSH' },
  },
  {
    id: 'contract-unshielded',
    name: 'Unshielded contract token',
    model: 'Contract asset · account model — balances live in public contract state',
    desc: 'A contract holds every balance in a public map — and that contract is where issuer control lives.',
    usefulFor: 'Registry-style assets where full public auditability is the point.',
    features: { balances: false, amounts: false, parties: false, supply: true, controls: true, native: false },
    visibility: 'Fully public: anyone can enumerate every holder, balance and transfer.',
    deployable: true,
    statusLine: 'Working example — full lifecycle: mint, transfer, redeem.',
    defaults: { name: 'ACME Dollar', symbol: 'aUSD' },
  },
  {
    id: 'zswap-shielded',
    name: 'ZSwap shielded UTXO token',
    model: 'Native ledger asset · shielded UTXO model — commitments and nullifiers on-chain',
    desc: 'The private native asset: bearer coins whose amounts, holders and links the ledger itself hides.',
    usefulFor: 'Private bearer instruments and cash-like assets where holder privacy dominates.',
    features: { balances: true, amounts: true, parties: true, supply: true, controls: false, native: true },
    visibility: 'Shielded: balances, amounts and counterparties are hidden; the public sees commitments.',
    deployable: true,
    statusLine: 'Working example — owner-gated mint into the shielded pool; issuance stays public.',
    defaults: { name: 'ACME Private Cash', symbol: 'aPRV' },
  },
  {
    id: 'contract-confidential',
    name: 'Shielded contract token — confidential (CFT)',
    model: 'Contract asset · account model — encrypted balances, public attestable supply',
    desc: 'Encrypted balances and hidden transfer values, with issuer mint and redeem — supply stays public so backing is attestable.',
    usefulFor: 'Deposits, fund shares, e-money — instruments that need both privacy and issuer control.',
    features: { balances: true, amounts: true, parties: false, supply: true, controls: true, native: false },
    visibility: 'Confidential values: balances encrypted, amounts hidden; identifiers, graph and supply public.',
    deployable: true,
    statusLine: 'Working example — full lifecycle: mint, transfer, redeem.',
    defaults: { name: 'ACME Deposit', symbol: 'aDEP' },
  },
  {
    id: 'contract-note',
    name: 'Shielded contract token — note-based',
    model: 'Contract asset · note model — contract-managed shielded notes',
    desc: 'Contract-managed shielded notes: private holders, amounts and links, with issuer controls. The standard is under development.',
    usefulFor: 'Fully private regulated instruments, once the standard matures.',
    features: { balances: true, amounts: true, parties: true, supply: true, controls: true, native: false },
    visibility: 'Shielded throughout.',
    deployable: false,
    statusLine: 'Under development.',
    defaults: { name: 'ACME Notes', symbol: 'aNTE' },
  },
];

export const tokenDef = (id: TokenType): TokenDef => TOKEN_DEFS.find((t) => t.id === id)!;
export type CustodyId = 'demo' | 'hsm' | 'mpc' | 'multisig' | '2of3' | 'role' | 'custom';
export type StudioNetwork = 'stagenet' | 'local';

export interface StudioConfig {
  token: TokenType;
  /** Issuer-control toggles — enabling a designed control records intent only. */
  ctl: Record<'mint' | 'redeem' | 'pause' | 'freeze' | 'allowlist' | 'restrict' | 'recovery' | 'clawback' | 'supplyCap' | 'roles', boolean>;
  custody: CustodyId;
  network: StudioNetwork;
  /** Issuer-sponsored customer fees: customers hold zero DUST, the issuer pays. */
  sponsored: boolean;
  assetName: string;
  symbol: string;
}

export const DEFAULT_CONFIG: StudioConfig = {
  token: 'contract-confidential',
  sponsored: true,
  network: 'stagenet',
  ctl: { mint: true, redeem: true, pause: false, freeze: false, allowlist: false, restrict: false, recovery: false, clawback: false, supplyCap: false, roles: false },
  custody: 'demo',
  assetName: 'ACME Deposit',
  symbol: 'aDEP',
};

export const STAGE_LABELS = [
  'Token type',
  'Privacy overview',
  'Issuer controls',
  'Custody & approvals',
  'Network & fees',
  'Review & deploy',
] as const;

// --- Issuer controls ---------------------------------------------------------------

export interface ControlDef {
  readonly id: keyof StudioConfig['ctl'];
  readonly label: string;
  readonly desc: string;
  /** True only when the deployed contract actually exposes this operation. */
  readonly available: boolean;
}

// Availability is read off the contracts themselves: public-token.compact and
// confidential-token.compact expose mint, burn/redeem and transfer (plus CFT
// register/sweep) — and nothing else. Everything else is under development.
export const CONTROL_DEFS: readonly ControlDef[] = [
  { id: 'mint', label: 'Mint', desc: 'Issue new units under issuer authority', available: true },
  { id: 'redeem', label: 'Redeem', desc: 'Burn units returned to the issuer', available: true },
  { id: 'pause', label: 'Pause', desc: 'Suspend all transfers', available: false },
  { id: 'freeze', label: 'Freeze account', desc: 'Suspend a single participant', available: false },
  { id: 'allowlist', label: 'Allowlist', desc: 'Restrict holding to approved participants', available: false },
  { id: 'restrict', label: 'Transfer restrictions', desc: 'Rule-based limits on transfers', available: false },
  { id: 'recovery', label: 'Recovery', desc: 'Recover units from a lost account', available: false },
  { id: 'clawback', label: 'Forced transfer / clawback', desc: 'Move units under legal authority', available: false },
  { id: 'supplyCap', label: 'Supply limits', desc: 'Cap total circulating supply', available: false },
  { id: 'roles', label: 'Role-based administration', desc: 'Separate issuer, operator and compliance roles', available: false },
];

// --- Custody & approvals --------------------------------------------------------------

export interface CustodyDef {
  readonly id: CustodyId;
  readonly label: string;
  readonly desc: string;
  /** Selectable today. Unavailable options render greyed out, unselectable. */
  readonly available: boolean;
  /** 'onchain' leads; 'infra' sits underneath as integration paths. */
  readonly group: 'onchain' | 'infra';
}

export const CUSTODY_DEFS: readonly CustodyDef[] = [
  { id: 'demo', label: 'Demonstration issuer key', desc: 'A single issuer authority. What runs today.', available: true, group: 'onchain' },
  { id: 'multisig', label: 'ECDSA multisig (contract-based)', desc: 'Multiple distinct keys must sign before the contract accepts a sensitive operation.', available: false, group: 'onchain' },
  { id: 'role', label: 'Contract-based approval', desc: 'Approval rules enforced by the asset contract itself — roles, quorums and limits live in contract state.', available: false, group: 'onchain' },
  { id: 'hsm', label: 'HSM-backed key', desc: 'Issuer key held in a hardware security module.', available: false, group: 'infra' },
  { id: 'mpc', label: 'MPC / threshold signing', desc: 'Key shares held across parties; no single point of compromise.', available: false, group: 'infra' },
  { id: 'custom', label: 'Custom custody integration', desc: 'Integrate an existing institutional custody platform.', available: false, group: 'infra' },
];

export const custodyLabel = (id: CustodyId): string =>
  CUSTODY_DEFS.find((c) => c.id === id)?.label ?? id;

// --- Privacy overview -----------------------------------------------------------------------
//
// Read-only, per token type. No toggles: a fact the model cannot make private
// is stated as public, plainly — the model defines the profile, not a wish.

export interface PrivacyFact {
  readonly fact: string;
  readonly desc: string;
  readonly state: 'Confidential' | 'Hidden' | 'Public' | 'Public by design';
  readonly who: { pub: string; iss: string; hold: string; rev: string };
}

const ALL_PUBLIC = (what: string) => ({
  pub: what,
  iss: what,
  hold: what,
  rev: 'Public view — nothing extra to disclose',
});

export function privacyOverview(token: TokenType): readonly PrivacyFact[] {
  if (token === 'contract-confidential') {
    return [
      {
        fact: 'Account balances', desc: 'The balance held by each participant', state: 'Confidential',
        who: { pub: 'Ciphertext only', iss: 'Not visible — issuing grants no read access', hold: 'Own balance, proof-verified', rev: 'Public view today; viewing-key disclosure is on the roadmap' },
      },
      {
        fact: 'Transfer values', desc: 'The amount moved in each transfer', state: 'Hidden',
        who: { pub: 'Never appears on-chain', iss: 'Own issue/redeem amounts only', hold: 'Own transfers', rev: 'Public view today' },
      },
      {
        fact: 'Sender & recipient identity', desc: 'Which accounts take part in a transfer', state: 'Public',
        who: ALL_PUBLIC('Account identifiers on every transfer'),
      },
      {
        fact: 'Transaction graph', desc: 'The pattern of who transacts with whom', state: 'Public',
        who: ALL_PUBLIC('Fully observable'),
      },
      {
        fact: 'Circulating supply', desc: 'Total units in circulation, and each issue/redeem delta', state: 'Public by design',
        who: ALL_PUBLIC('Exact supply — so the issuer can attest backing'),
      },
      {
        fact: 'Asset identity & policy state', desc: 'Standard, symbol, and issuer control state', state: 'Public',
        who: ALL_PUBLIC('Standard, symbol and control state'),
      },
    ];
  }
  if (token === 'zswap-shielded' || token === 'contract-note') {
    const label = token === 'zswap-shielded' ? 'Hidden by the ledger' : 'Hidden by the contract (design)';
    return [
      { fact: 'Account balances', desc: 'The balance held by each participant', state: 'Hidden', who: { pub: label, iss: label, hold: 'Own coins/notes', rev: 'No mechanism defined yet' } },
      { fact: 'Transfer values', desc: 'The amount moved in each transfer', state: 'Hidden', who: { pub: label, iss: label, hold: 'Own transfers', rev: 'No mechanism defined yet' } },
      { fact: 'Sender & recipient identity', desc: 'Which accounts take part in a transfer', state: 'Hidden', who: { pub: 'Unlinkable (commitments and nullifiers)', iss: 'Unlinkable', hold: 'Own transfers', rev: 'No mechanism defined yet' } },
      { fact: 'Transaction graph', desc: 'The pattern of who transacts with whom', state: 'Hidden', who: { pub: 'Not observable', iss: 'Not observable', hold: 'Own activity', rev: 'No mechanism defined yet' } },
      { fact: 'Circulating supply', desc: 'Total units in circulation', state: 'Hidden', who: { pub: token === 'zswap-shielded' ? 'Not attestable per-asset' : 'Attestability is open design work', iss: 'Same', hold: 'Same', rev: 'No mechanism defined yet' } },
    ];
  }
  // The two unshielded types: everything public, and that is the product.
  return [
    { fact: 'Account balances', desc: 'The balance held by each participant', state: 'Public', who: ALL_PUBLIC(token === 'utxo-unshielded' ? 'Every coin visible in the UTXO set' : 'Every balance enumerable from contract state') },
    { fact: 'Transfer values', desc: 'The amount moved in each transfer', state: 'Public', who: ALL_PUBLIC('Every amount visible') },
    { fact: 'Sender & recipient identity', desc: 'Which accounts take part in a transfer', state: 'Public', who: ALL_PUBLIC('Both identifiers on every transfer') },
    { fact: 'Transaction graph', desc: 'The pattern of who transacts with whom', state: 'Public', who: ALL_PUBLIC('Fully observable') },
    { fact: 'Circulating supply', desc: 'Total units in circulation', state: 'Public', who: ALL_PUBLIC('Exact supply') },
    { fact: 'Asset identity & policy state', desc: 'Standard, symbol, and issuer control state', state: 'Public', who: ALL_PUBLIC('Standard, symbol and control state') },
  ];
}

// --- Assurance & brief ---------------------------------------------------------------------

export interface KvRow {
  readonly k: string;
  readonly v: string;
  readonly chip?: string;
  readonly tone?: 'success' | 'neutral' | 'warning' | 'danger' | 'accent';
}

export function assuranceRows(network: StudioNetwork, token: TokenType): KvRow[] {
  const confidential = token === 'contract-confidential';
  const standard: Record<string, string> = {
    'contract-confidential': 'Confidential fungible token + public-supply extension (OpenZeppelin Compact)',
    'contract-unshielded': 'FungibleToken + Ownable in public contract state (OpenZeppelin Compact)',
    'utxo-unshielded': 'Native unshielded mint gated by OpenZeppelin Ownable; coins are ledger-native',
    'zswap-shielded': 'Shielded (ZSwap) mint gated by OpenZeppelin Ownable; coins live in the shielded pool',
    'contract-note': 'No module exists yet',
  };
  const rows: KvRow[] = [
    {
      k: 'Asset standard',
      v: standard[token]!,
      chip: 'Example available', tone: 'success',
    },
    { k: 'Module & version', v: '@openzeppelin/compact-contracts 0.3.0-alpha.2', chip: 'Pre-release', tone: 'warning' },
    { k: 'Implementation status', v: 'Full lifecycle (deploy, issue, transfer, redeem) verified on localnet; Stagenet run pending test funds', chip: 'Localnet', tone: 'accent' },
    { k: 'Audit status', v: 'OpenZeppelin designs and audits these standards; this implementation has not completed an applicable audit', chip: 'Not audited', tone: 'warning' },
  ];
  if (confidential) {
    rows.push(
      { k: 'Known patches', v: 'Typed Jubjub scalars for Compact 0.25 — documented mechanical patch to the module', chip: 'Patched', tone: 'neutral' },
      { k: 'Compiler & protocol', v: 'This contract compiles without zkir-v3 (documented compiler issue); the proof server accepts both IR versions', chip: 'Constraint', tone: 'neutral' },
      { k: 'Disclosure status', v: 'Authorised-reviewer disclosure is on the roadmap, not in the pinned module', chip: 'Roadmap', tone: 'warning' },
    );
  }
  rows.push(
    { k: 'Custody status', v: 'Deploys under a single demonstration issuer key; institutional custody integration is the designed target', chip: 'Demonstration', tone: 'warning' },
    { k: 'Proving trust boundary', v: 'Proofs generated locally; witness data never leaves the operator’s machine', chip: 'Local', tone: 'success' },
    {
      k: 'Selected network',
      v: network === 'stagenet' ? 'Stagenet — public Midnight test network; test assets only' : 'Local development network; every session starts a fresh chain',
      chip: network === 'stagenet' ? 'Stagenet' : 'Localnet',
      tone: 'accent',
    },
  );
  return rows;
}

export function briefRows(config: StudioConfig): KvRow[] {
  const t = config.token;
  const def = tokenDef(t);
  const composition: Record<string, string> = {
    'contract-confidential': 'Confidential fungible token + public-supply extension + Ownable (OpenZeppelin Compact)',
    'contract-unshielded': 'FungibleToken + Ownable in public contract state (OpenZeppelin Compact)',
    'utxo-unshielded': 'Owner-gated native mint (Ownable) — coins are ledger-native unshielded UTXOs',
    'zswap-shielded': 'Owner-gated shielded mint (Ownable) — coins live in the shielded pool',
    'contract-note': 'Placeholder — no module exists yet',
  };
  const privacy: Record<string, string> = {
    'contract-confidential': 'Balances encrypted · transfer values hidden · identifiers, graph and supply public',
    'contract-unshielded': 'Fully public — every holder, balance and transfer is enumerable',
    'utxo-unshielded': 'Fully public — coins, amounts and counterparties visible in the UTXO set',
    'zswap-shielded': 'Shielded — balances, amounts and counterparties hidden; total issuance public',
    'contract-note': 'Shielded throughout (design)',
  };
  const rows: KvRow[] = [
    { k: 'Token type', v: def.name },
    { k: 'Technical composition', v: composition[t]! },
    { k: 'Privacy profile', v: privacy[t]! },
  ];
  if (t.startsWith('contract')) {
    const ctlOn = CONTROL_DEFS.filter((c) => config.ctl[c.id]).map((c) => c.label).join(' · ');
    rows.push({ k: 'Issuer controls', v: ctlOn || 'None selected' });
    rows.push({
      k: 'Custody & approvals',
      v: custodyLabel(config.custody) + (config.custody === 'demo' ? '' : ' (target policy — deploys with the demonstration key today)'),
    });
  } else {
    rows.push({ k: 'Issuer controls', v: 'Owner-gated mint only — no post-mint control (bearer model)' });
    rows.push({
      k: 'Custody & approvals',
      v: t === 'utxo-unshielded'
        ? 'Holder-side key custody — HSM/MPC/multisig apply directly'
        : 'Note-secret custody — witness material consumed by a local prover',
    });
  }
  rows.push(
    {
      k: 'Customer fees',
      v: config.sponsored
        ? 'Issuer-sponsored — customers hold zero DUST; they bind transactions, the issuer attaches fees'
        : 'Self-funded — each customer wallet holds NIGHT and generates its own DUST',
    },
    { k: 'Network', v: config.network === 'stagenet' ? 'Stagenet — public Midnight test network' : 'Local development network' },
    {
      k: 'Lifecycle',
      v: t.startsWith('contract')
        ? 'Deploy · issue · transfer · redeem — verified on localnet'
        : 'Deploy · issue (contract mint) · wallet transfers · return to issuer — verified on localnet',
    },
  );
  return rows;
}

// --- Persistence across the network-switch reload -------------------------------------------

const CONFIG_KEY = 'mra.studio.config.v1';

/** Non-secret wizard config only — never seeds, never wallet material. */
export function saveConfig(config: StudioConfig, stage: number): void {
  try {
    sessionStorage.setItem(CONFIG_KEY, JSON.stringify({ config, stage }));
  } catch {
    /* private browsing */
  }
}

export function loadConfig(): { config: StudioConfig; stage: number } | null {
  try {
    const raw = sessionStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { config: StudioConfig; stage: number };
    const config = { ...DEFAULT_CONFIG, ...parsed.config };
    if (!CUSTODY_DEFS.some((c) => c.id === config.custody && c.available)) config.custody = 'demo';
    for (const c of CONTROL_DEFS) if (!c.available) config.ctl[c.id] = false;
    return { config, stage: parsed.stage };
  } catch {
    return null;
  }
}

export function clearConfig(): void {
  try {
    sessionStorage.removeItem(CONFIG_KEY);
  } catch {
    /* ignore */
  }
}
