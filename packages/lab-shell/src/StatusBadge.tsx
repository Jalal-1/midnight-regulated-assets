/**
 * Status as TEXT, always — never colour alone (accessibility requirement).
 * Colour classes only reinforce the label.
 */

const TONE: Record<string, string> = {
  'Demonstrated on localnet': 'ok',
  'Verified on Stagenet': 'ok',
  Implemented: 'ok',
  'Integration-tested': 'ok',
  'Custodian-validated': 'ok',
  'Designed for compatibility': 'warn',
  'Requires adaptation': 'warn',
  'In development': 'warn',
  'Under investigation': 'warn',
  'Not demonstrated': 'muted',
  'Not integrated': 'muted',
  'Not implemented': 'muted',
  'Not production-ready': 'muted',
  'Production-ready': 'ok',
};

export default function StatusBadge({ status }: { readonly status: string }) {
  return <span className={`status-badge tone-${TONE[status] ?? 'muted'}`}>{status}</span>;
}
