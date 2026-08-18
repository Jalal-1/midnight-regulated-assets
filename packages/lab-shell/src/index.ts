/**
 * The shared walkthrough shell: everything a lab or portal page needs that is
 * not specific to one asset model. Portal pages import from here; nothing in
 * here knows about a specific contract.
 */

export { default as LogoMark } from './Logo.tsx';
export { Link, Router, navigate, usePath } from './router.tsx';
export { useTheme } from './theme.ts';
export { currentNetwork, currentNetworkName, isHostedPage, switchNetwork } from './network.ts';
export { default as NetPill } from './NetPill.tsx';
export { OpBar, TimingBar, useOps, OP_PHASES } from './ops.tsx';
export type { LogLine as OpsLogLine, Operation, Status as OpsStatus } from './ops.tsx';
export {
  getProvingObserver,
  probeAll,
  streamLogs,
  LOG_SIDECAR_URL,
} from './infra.ts';
export type { Health, InfraStatus, LogLine as InfraLogLine, ProvingMeter } from './infra.ts';
export { default as Infrastructure } from './Infrastructure.tsx';
export { default as SiteNav } from './SiteNav.tsx';
export { LpNav, LpFooter, LOCAL_STACK_COMMANDS } from './LpNav.tsx';
export { default as LabLayout, LabSection } from './LabLayout.tsx';
export { default as VisibilityMatrix } from './VisibilityMatrix.tsx';
export { default as StatusBadge } from './StatusBadge.tsx';
