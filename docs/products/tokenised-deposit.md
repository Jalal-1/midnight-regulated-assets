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
neutrally, no verdicts — native token · public contract token · shielded UTXO
token · account-based CFT · note-based token.

Outcome: the account-based confidential token satisfies the checklist today;
note-based is the higher-privacy path as it matures.

## 3. The lifecycle, live
Issue · Transfer · Audit · Redeem — on the chosen composition, with the
multi-party view on each.

## 4. Build it
Which blocks, how wired, fork instructions.
