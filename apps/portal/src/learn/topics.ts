/**
 * The Learn section's content, verbatim from the design. One entry per
 * chapter; each carries its interactive-model kind.
 */

export interface Term {
  readonly name: string;
  readonly def: string;
}

export interface Topic {
  readonly id: 'ledger' | 'proving' | 'disclosure' | 'dust';
  readonly title: string;
  readonly summary: string;
  readonly paragraphs: readonly string[];
  readonly terms: readonly Term[];
  readonly hint: string;
}

export const TOPICS: readonly Topic[] = [
  {
    id: 'ledger',
    title: 'The dual-state ledger',
    summary:
      'Shielded and unshielded state side by side — what each records, and why both exist.',
    paragraphs: [
      'Every Midnight contract can hold two kinds of state at once. Unshielded state is ordinary public ledger data — balances and records anyone can read and audit. Shielded state is private: the chain stores only cryptographic commitments, while the underlying values stay with their owners.',
      'This is what makes regulated assets practical. An issuer can keep the total supply public and auditable while individual holdings and transfers stay confidential. The two sides settle in the same transaction, on the same chain, with no bridges.',
      'Try both transfer kinds on the right and watch what the ledger actually records in each case.',
    ],
    terms: [
      { name: 'Unshielded state', def: 'Public contract data — readable by anyone, like a conventional chain.' },
      { name: 'Shielded state', def: 'Private data represented on-chain only as commitments.' },
      { name: 'Commitment', def: 'A hash that binds a value without revealing it.' },
    ],
    hint: 'Choose a kind, then submit',
  },
  {
    id: 'proving',
    title: 'Local proving',
    summary:
      'Zero-knowledge proofs made on your machine — the network verifies validity, never contents.',
    paragraphs: [
      'When you act on shielded state, your machine builds a zero-knowledge proof that the action follows the contract rules — balances suffice, signatures check, policy holds — without revealing the data itself.',
      'The application sends circuit-specific witness-bearing inputs to its configured proving service. In the default local setup that service runs on the same machine; a hosted prover changes the trust boundary. The chain receives the proof plus public transaction data and effects.',
      'In the hosted examples this is real: the console shows the local prover at :6300 doing exactly this on every transaction.',
    ],
    terms: [
      { name: 'Witness', def: 'The private inputs to a proof — never transmitted.' },
      { name: 'Proof (π)', def: 'A small artifact anyone can verify, revealing nothing but validity.' },
      { name: 'Proof server', def: 'The local service that generates proofs beside your wallet.' },
    ],
    hint: 'Generate a proof and watch what travels',
  },
  {
    id: 'disclosure',
    title: 'Selective disclosure',
    summary: 'Holder, issuer, regulator, public — each role sees exactly what policy grants it.',
    paragraphs: [
      'Privacy on Midnight is not all-or-nothing. Contracts written in Compact declare who may see what: the holder sees their own position, the issuer sees what it must administer, a regulator sees what policy grants — and the public sees only that valid transactions occurred.',
      'Disclosure is enforced by the contract, not by promises. There is no master key and no privileged database; each viewing right is a capability the asset itself defines.',
      'Switch roles on the right and watch the same transfer record change shape.',
    ],
    terms: [
      { name: 'Compact', def: 'Midnight’s smart-contract language, where disclosure policy is written.' },
      { name: 'Viewing capability', def: 'A role’s contract-defined right to read specific fields.' },
      { name: 'Rational privacy', def: 'Confidential by default, disclosable by design.' },
    ],
    hint: 'Pick a role',
  },
  {
    id: 'dust',
    title: 'NIGHT and DUST',
    summary:
      'The utility token and the resource it generates — how transactions are powered without fee surveillance.',
    paragraphs: [
      'NIGHT is Midnight’s utility token. Holding it generates DUST — the resource that powers transactions. DUST is non-transferable and replenishes over time, so paying for computation does not create a public trail of fee payments tied to your activity.',
      'For institutions this means predictable operating capacity: hold NIGHT sized to your throughput, and transaction capacity renews continuously instead of being bought per-use on an open fee market.',
      'Slide the NIGHT holding on the right to see how DUST capacity scales.',
    ],
    terms: [
      { name: 'NIGHT', def: 'The utility token; transferable, held to generate DUST.' },
      { name: 'DUST', def: 'Non-transferable transaction resource, renewed over time.' },
      { name: 'Fee privacy', def: 'Paying for computation without a linkable fee trail.' },
    ],
    hint: 'Drag the slider',
  },
];
