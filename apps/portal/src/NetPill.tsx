/**
 * The network indicator AND switcher. Impossible to miss which chain the page
 * is on; one click moves to the other one (via reload — the SDK's network id
 * is process-global, so an in-page switch would leave half the stack behind).
 *
 * Wallets live in page memory, so switching drops them — the confirm says so.
 */

import { currentNetworkName, switchNetwork } from './network.ts';

export default function NetPill({ chainId }: { readonly chainId: string | null }) {
  const name = currentNetworkName();
  const isLocalnet = name === 'localnet';

  const onSwitch = () => {
    const target = isLocalnet ? 'stagenet' : 'localnet';
    if (
      confirm(
        `Switch to ${target}? The page reloads and in-page wallets are dropped.` +
          (target === 'stagenet'
            ? ' Stagenet needs a faucet-funded seed — genesis seeds have no funds there.'
            : ''),
      )
    ) {
      switchNetwork(target);
    }
  };

  return isLocalnet ? (
    <button
      className="net-pill local"
      onClick={onSwitch}
      title="Local development chain — disposable; every `yarn localnet:up` is a fresh chain. Click to switch to Stagenet."
    >
      <span className="net-glyph" />
      <span>Local chain</span>
      <span className="net-meta">
        undeployed
        {chainId ? ` · ${chainId.slice(0, 10)}…` : ''}
      </span>
    </button>
  ) : (
    <button
      className="net-pill stage"
      onClick={onSwitch}
      title="Midnight Stagenet — hosted public test network. State persists; keys are faucet-funded. Proving stays LOCAL. Click to switch to the local chain."
    >
      <span className="net-glyph" />
      <span>STAGENET</span>
      <span className="net-meta">{chainId ? `${chainId.slice(0, 10)}…` : 'stagenet'}</span>
    </button>
  );
}
