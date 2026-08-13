/**
 * Thin wrapper over the Midnight Wallet SDK.
 *
 * Thin is the point: no abstraction that hides SDK semantics. There is no Lace
 * on the 2.x line, so every wallet here is programmatic.
 *
 * Responsibilities:
 *   - build wallets from a seed (see the SDK's hd package)
 *   - expose balances and addresses
 *   - submit transactions
 *   - be DUST-aware during setup
 *
 * This package also owns the one piece of required global wiring:
 * midnight-js stores the network ID in module-level state, and getNetworkId()
 * throws if it was never set. So exactly one call site, here, must run
 *
 *     setNetworkId(getNetwork().networkId)
 *
 * before any wallet or contract operation. Doing it anywhere else invites two
 * call sites disagreeing about which chain we are on.
 */
export {};
