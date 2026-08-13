/**
 * Thin wrapper over the Midnight Wallet SDK.
 *
 * Thin is the point: no abstraction that hides SDK semantics. There is no Lace
 * on 2.x, so every wallet here is programmatic.
 *
 * Responsibilities: build wallets from a seed, expose balances/addresses,
 * submit transactions, and be DUST-aware on setup.
 */
export {};
