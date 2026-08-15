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

export type Product = 'deposit' | 'mmf' | 'custom';
export type CustodyId = 'demo' | 'hsm' | 'mpc' | 'multisig' | '2of3' | 'role' | 'custom';
export type StudioNetwork = 'stagenet' | 'local';

export interface StudioConfig {
  product: Product;
  /** Privacy toggles per fact — selections the model cannot honour stay flagged. */
  priv: Record<'balances' | 'values' | 'counterparties' | 'graph' | 'supply' | 'assetType' | 'policy', boolean>;
  /** Issuer-control toggles — enabling a designed control records intent only. */
  ctl: Record<'mint' | 'redeem' | 'pause' | 'freeze' | 'allowlist' | 'restrict' | 'recovery' | 'clawback' | 'supplyCap' | 'roles', boolean>;
  custody: CustodyId;
  network: StudioNetwork;
  assetName: string;
  symbol: string;
}

export const DEFAULT_CONFIG: StudioConfig = {
  product: 'deposit',
  priv: { balances: true, values: true, counterparties: false, graph: false, supply: false, assetType: false, policy: false },
  ctl: { mint: true, redeem: true, pause: true, freeze: false, allowlist: true, restrict: false, recovery: false, clawback: false, supplyCap: false, roles: true },
  custody: 'demo',
  network: 'local',
  assetName: 'Confidential deposit token',
  symbol: 'CDT',
};

export const PRODUCT_LABEL: Record<Product, string> = {
  deposit: 'Deposit token',
  mmf: 'Money-market fund',
  custom: 'Custom asset',
};

export const PRODUCT_NAME: Record<Product, { name: string; symbol: string }> = {
  deposit: { name: 'Confidential deposit token', symbol: 'CDT' },
  mmf: { name: 'Tokenised money-market fund', symbol: 'TMF' },
  custom: { name: 'Custom regulated asset', symbol: 'CRA' },
};

export const STAGE_LABELS = [
  'Financial product',
  'Privacy & disclosure',
  'Issuer controls',
  'Custody & approvals',
  'Network & assurance',
  'Review & deploy',
] as const;

// --- Issuer controls ---------------------------------------------------------------

export interface ControlDef {
  readonly id: keyof StudioConfig['ctl'];
  readonly label: string;
  readonly desc: string;
  readonly status: 'Demonstrated' | 'Designed' | 'Requires extension' | 'Not implemented';
  readonly tone: 'success' | 'neutral' | 'warning' | 'danger';
}

export const CONTROL_DEFS: readonly ControlDef[] = [
  { id: 'mint', label: 'Mint', desc: 'Issue new units under issuer authority', status: 'Demonstrated', tone: 'success' },
  { id: 'redeem', label: 'Redeem', desc: 'Burn units returned to the issuer', status: 'Demonstrated', tone: 'success' },
  { id: 'pause', label: 'Pause', desc: 'Suspend all transfers', status: 'Designed', tone: 'neutral' },
  { id: 'freeze', label: 'Freeze account', desc: 'Suspend a single participant', status: 'Designed', tone: 'neutral' },
  { id: 'allowlist', label: 'Allowlist', desc: 'Restrict holding to approved participants', status: 'Designed', tone: 'neutral' },
  { id: 'restrict', label: 'Transfer restrictions', desc: 'Rule-based limits on transfers', status: 'Designed', tone: 'neutral' },
  { id: 'recovery', label: 'Recovery', desc: 'Recover units from a lost account', status: 'Not implemented', tone: 'danger' },
  { id: 'clawback', label: 'Forced transfer / clawback', desc: 'Move units under legal authority', status: 'Not implemented', tone: 'danger' },
  { id: 'supplyCap', label: 'Supply limits', desc: 'Cap total circulating supply', status: 'Requires extension', tone: 'warning' },
  { id: 'roles', label: 'Role-based administration', desc: 'Separate issuer, operator and compliance roles', status: 'Designed', tone: 'neutral' },
];

// --- Custody & approvals --------------------------------------------------------------

export interface CustodyDef {
  readonly id: CustodyId;
  readonly label: string;
  readonly desc: string;
  readonly status: 'Available' | 'Designed' | 'Requires integration';
  readonly tone: 'success' | 'neutral' | 'warning';
}

export const CUSTODY_DEFS: readonly CustodyDef[] = [
  { id: 'demo', label: 'Demonstration issuer key', desc: 'A single issuer authority. What runs today.', status: 'Available', tone: 'success' },
  { id: 'hsm', label: 'HSM-backed key', desc: 'Issuer key held in a hardware security module.', status: 'Designed', tone: 'neutral' },
  { id: 'mpc', label: 'MPC / threshold signing', desc: 'Key shares held across parties; no single point of compromise.', status: 'Designed', tone: 'neutral' },
  { id: 'multisig', label: 'ECDSA multisig', desc: 'Multiple distinct keys authorise sensitive operations.', status: 'Designed', tone: 'neutral' },
  { id: '2of3', label: '2-of-3 approval policy', desc: 'Any two of three designated approvers authorise.', status: 'Designed', tone: 'neutral' },
  { id: 'role', label: 'Contract-based role approval', desc: 'Approval rules enforced by the asset contract itself.', status: 'Designed', tone: 'neutral' },
  { id: 'custom', label: 'Custom custody integration', desc: 'Integrate an existing institutional custody platform.', status: 'Requires integration', tone: 'warning' },
];

export const custodyLabel = (id: CustodyId): string =>
  CUSTODY_DEFS.find((c) => c.id === id)?.label ?? id;

// --- Privacy & disclosure rows ------------------------------------------------------------

interface AudienceViews {
  readonly pub: string;
  readonly iss: string;
  readonly hold: string;
  readonly rev: string;
}

interface PrivacyDef {
  readonly id: keyof StudioConfig['priv'];
  readonly label: string;
  readonly desc: string;
  readonly can: 'impl' | 'designed' | 'none';
  readonly priv?: AudienceViews;
  readonly open?: AudienceViews;
  readonly pubStr?: AudienceViews;
}

const PRIVACY_DEFS: readonly PrivacyDef[] = [
  {
    id: 'balances', label: 'Account balances', desc: 'The balance held by each participant', can: 'impl',
    priv: { pub: 'Ciphertext only', iss: 'Not visible — no viewing mechanism', hold: 'Own balance', rev: 'Not implemented' },
    open: { pub: 'Plaintext balances', iss: 'All balances', hold: 'All balances', rev: 'Public view' },
  },
  {
    id: 'values', label: 'Transfer values', desc: 'The amount moved in each transfer', can: 'impl',
    priv: { pub: 'Hidden', iss: 'Own operations only', hold: 'Own transfers', rev: 'Not implemented' },
    open: { pub: 'Every value', iss: 'Every value', hold: 'Every value', rev: 'Public view' },
  },
  {
    id: 'counterparties', label: 'Sender & recipient identity', desc: 'Which accounts take part in a transfer', can: 'none',
    pubStr: { pub: 'Account identifiers', iss: 'Account identifiers', hold: 'Account identifiers', rev: 'Public view' },
  },
  {
    id: 'graph', label: 'Transaction graph', desc: 'The pattern of who transacts with whom', can: 'none',
    pubStr: { pub: 'Full graph observable', iss: 'Full graph', hold: 'Full graph', rev: 'Public view' },
  },
  {
    id: 'supply', label: 'Circulating supply', desc: 'Total units in circulation', can: 'designed',
    pubStr: { pub: 'Exact supply', iss: 'Exact supply', hold: 'Exact supply', rev: 'Public view' },
  },
  {
    id: 'assetType', label: 'Asset type', desc: 'What kind of instrument this is', can: 'none',
    pubStr: { pub: 'Standard & symbol', iss: 'Standard & symbol', hold: 'Standard & symbol', rev: 'Public view' },
  },
  {
    id: 'policy', label: 'Policy & compliance state', desc: 'Pause, allowlist and control state', can: 'none',
    pubStr: { pub: 'Control state', iss: 'Control state', hold: 'Control state', rev: 'Public view' },
  },
];

export interface PrivacyRow extends AudienceViews {
  readonly id: keyof StudioConfig['priv'];
  readonly label: string;
  readonly desc: string;
  readonly status: string;
  readonly tone: 'success' | 'neutral' | 'warning';
  readonly on: boolean;
}

export function privacyRows(priv: StudioConfig['priv']): PrivacyRow[] {
  return PRIVACY_DEFS.map((d) => {
    const on = priv[d.id];
    let status: string;
    let tone: PrivacyRow['tone'];
    let who: AudienceViews;
    if (d.can === 'impl') {
      if (on) { status = 'Confidential — implemented'; tone = 'success'; who = d.priv!; }
      else { status = 'Public — implemented'; tone = 'neutral'; who = d.open!; }
    } else if (d.can === 'designed') {
      who = d.pubStr!;
      if (on) { status = 'Attestable supply is designed — public today'; tone = 'warning'; }
      else { status = 'Public — implemented'; tone = 'neutral'; }
    } else {
      who = d.pubStr!;
      if (on) { status = 'Not implemented — remains public today'; tone = 'warning'; }
      else { status = 'Public in the current model'; tone = 'neutral'; }
    }
    return { id: d.id, label: d.label, desc: d.desc, status, tone, on, ...who };
  });
}

export interface VisibilityProfile {
  readonly list: readonly { aud: string; lines: readonly string[] }[];
  readonly warn: string;
}

export function visibilityProfile(priv: StudioConfig['priv']): VisibilityProfile {
  const warn: string[] = [];
  if (priv.counterparties) warn.push('sender & recipient identity');
  if (priv.graph) warn.push('transaction graph');
  if (priv.assetType) warn.push('asset type');
  if (priv.policy) warn.push('policy state');
  if (priv.supply) warn.push('attestable supply (designed)');
  return {
    list: [
      {
        aud: 'Public',
        lines: [
          priv.balances ? 'Balances: ciphertext only' : 'Balances: plaintext',
          priv.values ? 'Transfer values: hidden' : 'Transfer values: visible',
          'Identifiers & graph: visible',
          'Supply: public',
          'Policy state: public',
        ],
      },
      {
        aud: 'Issuer',
        lines: [
          'Issue & redeem amounts: own operations',
          priv.balances ? 'Holder balances: not visible' : 'Holder balances: visible',
          'Participant identifiers: visible',
        ],
      },
      {
        aud: 'Holder',
        lines: [
          'Own balance & transfers: visible',
          priv.values ? 'Other holders’ values: hidden' : 'All values: visible',
          'Counterparty identifiers: visible',
        ],
      },
      { aud: 'Authorised reviewer', lines: ['Sees the public view only', 'Privileged disclosure: not implemented'] },
    ],
    warn: warn.length
      ? `Requested but not available today: ${warn.join(', ')}. These stay public in the current confidential token.`
      : '',
  };
}

// --- Assurance & brief ---------------------------------------------------------------------

export interface KvRow {
  readonly k: string;
  readonly v: string;
  readonly chip?: string;
  readonly tone?: 'success' | 'neutral' | 'warning' | 'danger' | 'accent';
}

export function assuranceRows(network: StudioNetwork): KvRow[] {
  return [
    { k: 'Asset standard', v: 'Confidential fungible token + public-supply extension (OpenZeppelin Compact)', chip: 'Demonstrated', tone: 'success' },
    { k: 'Module & version', v: '@openzeppelin/compact-contracts 0.3.0-alpha.2', chip: 'Pre-release', tone: 'warning' },
    { k: 'Implementation status', v: 'Full lifecycle (deploy, issue, transfer, redeem) verified on localnet; not yet verified on Stagenet', chip: 'Localnet', tone: 'accent' },
    { k: 'Audit status', v: 'Standards are being designed and audited by OpenZeppelin; this implementation has not completed an applicable audit', chip: 'Not audited', tone: 'warning' },
    { k: 'Known patches', v: 'Typed Jubjub scalars for Compact 0.25 — documented mechanical patch to the module', chip: 'Patched', tone: 'neutral' },
    { k: 'Compiler & protocol', v: 'The confidential token is compiled WITHOUT zkir-v3 due to a documented internal compiler error; the experimental proof server accepts both IR versions', chip: 'Constraint', tone: 'neutral' },
    { k: 'Custody status', v: 'Single demonstration issuer key; institutional custody integrations designed, not built', chip: 'Demonstration', tone: 'warning' },
    { k: 'Disclosure status', v: 'Authorised-reviewer disclosure not implemented', chip: 'Not implemented', tone: 'danger' },
    { k: 'Proving trust boundary', v: 'Proofs generated locally; witness data never leaves the operator’s machine', chip: 'Local', tone: 'success' },
    {
      k: 'Selected network',
      v: network === 'stagenet' ? 'Stagenet — public Midnight test network; test assets only' : 'Local development network; every session starts a fresh chain',
      chip: network === 'stagenet' ? 'Stagenet' : 'Localnet',
      tone: 'accent',
    },
  ];
}

export function briefRows(config: StudioConfig): KvRow[] {
  const ctlOn = CONTROL_DEFS.filter((c) => config.ctl[c.id]).map((c) => c.label).join(' · ');
  return [
    { k: 'Financial product', v: PRODUCT_NAME[config.product].name },
    { k: 'Technical asset model', v: 'Account-based confidential fungible token + public-supply extension (OpenZeppelin Compact)' },
    {
      k: 'Privacy profile',
      v: `${config.priv.balances ? 'Balances confidential' : 'Balances public'} · ${config.priv.values ? 'transfer values hidden' : 'transfer values public'}`,
    },
    { k: 'Publicly visible', v: 'Circulating supply · account identifiers · transaction graph · policy state · ciphertexts' },
    { k: 'Issuer controls', v: ctlOn || 'None selected' },
    {
      k: 'Custody & approvals',
      v: custodyLabel(config.custody) + (config.custody === 'demo' ? '' : ' (target policy — deploys with the demonstration key today)'),
    },
    { k: 'Disclosure policy', v: 'Authorised-reviewer view: not implemented' },
    { k: 'Network', v: config.network === 'stagenet' ? 'Stagenet — public Midnight test network' : 'Local development network' },
    { k: 'Implementation maturity', v: 'Full lifecycle verified on localnet; Stagenet lifecycle not yet verified' },
    { k: 'Known limitations', v: 'Identifiers & graph public · single issuer key · no reviewer disclosure · pre-audit standard' },
  ];
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
    return { config: { ...DEFAULT_CONFIG, ...parsed.config }, stage: parsed.stage };
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
