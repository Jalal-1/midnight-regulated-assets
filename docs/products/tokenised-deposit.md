# Tokenised Deposit

**Use case:** commercial bank money on public rails. A bank issues deposits as
tokens; customers transact without broadcasting balances and flows; the bank
keeps issuer control; custodians operate 2-of-3 ECDSA multisig; the regulator
retains visibility.

Impossible on transparent chains (everything public) and unpalatable in walled
gardens (no interoperability).

## 1. The requirement
The checklist from the overview, as a bank states it.

## 2. Design options
Candidate token architectures, each demonstrated live, properties stated
neutrally, no verdicts — native token · public contract token · account-based
confidential token · shielded UTXO token.

Outcome: the **account-based confidential fungible token** satisfies the
checklist today. It is the composition the rest of this page uses.

Note it needs the `ConfidentialFungibleTokenPublicSupply` extension, not just the
base module: the base does not track total supply, and proving 1:1 backing
requires it.

**Shielded UTXO is demonstrated last and does not pass.** It is not
custody-compatible: OpenZeppelin keeps this module in `archive/`, marked
"archived until further notice, DO NOT USE IN PRODUCTION", because it has no
custom spend logic (no pause, no freeze) and cannot guarantee total-supply
accounting. Show it running, show what it cannot do, quote the upstream notice.

No note-based option is listed, because no note-based module exists upstream to
demonstrate. Do not claim it as a maturing path without a source.

## 3. The lifecycle, live
Issue · Transfer · Audit · Redeem — on the chosen composition, with the
multi-party view on each.

## 4. Build it
Which blocks, how wired, fork instructions.
