/**
 * THE BLOCKS.
 *
 * Every product in apps/ is a composition of these. Nothing product-specific
 * belongs here — if it only makes sense for the deposit, it lives in
 * apps/tokenised-deposit.
 *
 * The directory names mirror OpenZeppelin's compact-contracts (v0.3.0-alpha.1)
 * so each block maps onto its upstream counterpart without translation:
 *
 *   access/     Ownable · AccessControl · ShieldedAccessControl · ZOwnablePK
 *   multisig/   Signer (ECDSA) · ProposalManager · Forwarder{Shielded,Unshielded,
 *               Private} · {Shielded,Unshielded}Treasury · presets/ShieldedMultiSig
 *   security/   Allowlist · Blocklist · Pausable · Initializable
 *   token/      ConfidentialFungibleToken · FungibleToken · MultiToken ·
 *               NonFungibleToken · NativeShieldedToken*
 *   crypto/     ElGamal · EcdhMask
 *
 * Mapping from the product vocabulary to these directories:
 *   "2-of-3 ECDSA custody"  → multisig/ (Signer + a ShieldedMultiSig preset)
 *   "account-based CFT"     → token/ConfidentialFungibleToken
 *   "compliance operations" → security/ (Allowlist, Blocklist, Pausable)
 *
 * Two upstream facts worth knowing before designing against them:
 *
 * 1. OZ modules declare `pragma language_version >= 0.23.0`. Our counter does
 *    not declare one, matching the compiler's own canonical example.
 *
 * 2. There is no note-based token module. The shielded-UTXO token lives in
 *    upstream `archive/` and is marked "archived until further notice, DO NOT
 *    USE IN PRODUCTION" — it has no custom spend logic (so no pause or freeze)
 *    and cannot guarantee total-supply accounting. Those are precisely the
 *    regulated-asset requirements, so it is a documented dead end rather than a
 *    maturing option. Cite that upstream notice on the design-options page.
 *
 * 3. ConfidentialFungibleToken stores balances as ElGamal ciphertexts on Jubjub,
 *    with `accountId = persistentHash(secretKey)`. Total-supply tracking is NOT
 *    built in — it is an opt-in extension
 *    (`extensions/ConfidentialFungibleTokenPublicSupply`). A deposit that must
 *    prove 1:1 backing needs that extension, not just the base module.
 */
export {};
