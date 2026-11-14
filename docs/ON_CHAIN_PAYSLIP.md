# On-chain payslips

A payslip that an employee can prove, that an employer cannot later deny, and that survives the operator losing its database, without putting anyone's salary on a public chain.

## The idea in one paragraph

Salary data never goes on chain in the clear. A payslip is a canonical document held by the operator and given to the employee. Every field in it is salted and hashed into a Merkle tree. The employer signs the tree's root with EIP-712. The operator's relayer anchors the root, the document hash, the payday and the employer's address in a small `PayslipRegistry` contract on the same chain as the payout, and the payout transaction hashes sit inside the document. Later the employee can hand a lender or a landlord a disclosure bundle: the fields they choose, with their salts and Merkle proofs. Anyone can check that bundle against the chain with one read, and the employer does not need to be involved. Tamper evidence and timestamping come from the chain, privacy from the salts, and selective disclosure from the tree.

## What is on chain and what is not

| On chain (public) | Off chain (operator and employee) |
|---|---|
| `root`: Merkle root of the salted fields | The payslip document (JSON): names, gross, deductions, net, payouts, rates |
| `docHash`: keccak256 of the canonical JSON | The salts, one per field |
| `payday` as a Unix timestamp | The PDF rendering |
| `employer`: the address that signed | The employer's EIP-712 signature (also stored with the anchor) |
| `runId` and `personId` as keccak256 of opaque ids | The mapping from those hashes to a client and a person |
| The anchor transaction itself, so a block time | The payout transactions are ordinary ERC-20 transfers, already public; the document links to them by hash |

No name, amount, currency or wallet address appears in the anchor. The `personId` hash is an opaque id, not an email or a name, and it is the same across runs only so that an employee can show a run of consecutive payslips if they want to. See the privacy note below for how to break that link.

## Flow

```
approver signs run ─► payout worker pays each leg ─► every leg of an item final
                                                          │
                                                          ▼
                                  build PayslipDocument (core/payslip.ts)
                                  includes payout tx hashes, locked rates, usd value
                                                          │
                                                          ▼
                                  sealPayslip: salt each field, leaf = keccak(name, value, salt)
                                  root = sorted-pair Merkle root; docHash = keccak(canonical JSON)
                                                          │
                                                          ▼
                                  employer signature over EIP-712 Payslip{runId, personId, payday, root, docHash}
                                  (treasury wallet, or a delegated payroll signer the employer registered)
                                                          │
                                                          ▼
                                  operator relayer ─► PayslipRegistry.anchor(runId, personId, payday, root, docHash, employerSig)
                                                          │           emits PayslipAnchored(anchorId, runId, personId, employer, payday, root, docHash)
                                                          ▼
                                  store {leaves+salts, root, docHash, signature, anchorTx} in payslips table
                                  emit webhook payslip.anchored; employee's payslip shows "Anchored on Sepolia, tx 0x…"

later:  employee ─► GET /me/payslips/:runId/disclose?fields=net,payday,employerName
                 ─► hands {root, anchorTx, fields:[{leaf{name,value,salt}, proof[]}]} to a verifier
        verifier ─► recompute leaf hash, walk proof to root, read PayslipRegistry.getAnchor(anchorId)
                 ─► root matches, employer matches, payday matches, signature recovers to employer. Done.
```

## Data structures

In `packages/core/src/payslip.ts`:

- `PayslipDocument`: the canonical fields (`runId`, `runLabel`, `payday`, `employer`, `employerName`, `personId`, `personName`, `personType`, `kind`, `currency`, `gross`, `deduction`, `net`) and a `payouts[]` array (`option`, `amount`, `lockedRate`, `usdValue`, `txHash`, `address`, `network`). `payslipFields()` flattens it into a fixed order, with payout fields named `payout.<i>.<field>`.
- `leafHash(leaf) = keccak256(abi.encode(string name, string value, bytes32 salt))`.
- `merkleRoot()` and `merkleProof()`: a sorted-pair tree (each pair is hashed in ascending order, so a proof needs no left/right flags). An odd leaf is carried up unchanged.
- `sealPayslip(doc, salts)`: salts every field and returns `{doc, leaves, root, docHash}`. Pass the stored salts to re-seal deterministically.
- `disclose(sealed, names)`: the bundle for a third party.
- `verifyProof(root, leaf, proof)`: the check anyone can run.
- `canonicalJson()`: sorted keys, no whitespace, so `docHash` is stable across languages.
- `PAYSLIP_TYPES`: the EIP-712 struct `Payslip(bytes32 runId,bytes32 personId,uint64 payday,bytes32 root,bytes32 docHash)`, signed under `payslipRegistryDomain(chainId, registry)`, which is `{ name: "Sera.cx Payroll Payslips", version: "1", chainId, verifyingContract: registry }` and matches the contract's EIP-712 domain. (`payrollDomain(chainId, disburser, brand)` is the separate domain for pay run approvals.) `idToBytes32(id)` is `keccak256(utf8(id))`.

In `contracts/src/PayslipRegistry.sol` (see the contract and its tests for the exact signatures):

- `anchor(bytes32 runId, bytes32 personId, uint64 payday, bytes32 root, bytes32 docHash, bytes employerSignature)` recovers the employer from the EIP-712 signature, stores `{employer, payday, root, docHash, anchoredAt, version}` under `anchorId = keccak256(runId, personId)` and emits `PayslipAnchored`. The caller can be anyone; the signature is what names the employer.
- `getAnchor(anchorId)` returns the stored record; `anchorId(runId, personId)` computes the key.
- `leafHash(string name, string value, bytes32 salt)` and `verifyField(bytes32 anchorId, bytes32 leaf, bytes32[] proof)` are views, so a verifier with no tooling can compute the leaf and check the proof from a block explorer.
- EIP-1271 (multisig treasuries signing payslips) is not in the first version; see the roadmap.
- Anyone may relay an anchor; the signature is what binds it to the employer, so the relayer needs no trust and holds no employer key.

## Gas

One anchor per payslip is one small storage write and one event. On Sepolia it is free in practice; on mainnet it is the cost of a token transfer, which for monthly payroll is small next to the payouts themselves. If an operator runs thousands of payslips a month, the follow-up is **run-level anchoring**: build a second tree whose leaves are the payslip roots of the run, anchor only that run root, and store a per-payslip proof alongside each payslip. A disclosure then carries two proofs (field → payslip root → run root). The core helpers already support this; it needs a `anchorRun` entry point in the contract and a second proof in the bundle. This also suits the Sera.cx appchain once it is live.

## Corrections

Payslips get corrected. The same employer may call `anchor` again for the same `runId` and `personId` with the same payday and a different root; the registry replaces the root and docHash, increments `version` and emits `PayslipCorrected(anchorId, employer, version, oldRoot, newRoot, docHash)`. A different signer, a different payday or the same root is rejected. A verifier reads `version` from `getAnchor` and can tell from the events whether the payslip they were shown has been superseded. The employee sees both documents in their history with the correction reason from the document.

## Key management

- **Employer signature.** The default signer is the treasury wallet that approved the run, because the approval and the payslips then share one identity. An employer that does not want the treasury key used for anything but payments can register a **delegated payroll signer** in client settings; whichever key signs is the `employer` the contract records. In this repo the operator signer signs the root when the client has no treasury wallet set, which is what the demo does. Multisig treasuries need EIP-1271 support in the registry, which is on the roadmap.
- **Relayer.** The operator's `OPERATOR_SIGNER_PRIVATE_KEY` pays gas for the anchor transaction. It can never move funds and it never sees the employer's key. If it is compromised the attacker can anchor nothing useful, because every anchor needs a valid employer signature.
- **Salts.** Stored with the payslip in the operator's database and included in the employee's download. Losing the salts loses the ability to prove fields, not the anchor itself; the employee's own copy is the backup.

## What it protects against

| Threat | How |
|---|---|
| A forged payslip presented for a loan, a visa or a tenancy | The verifier checks the field against a root the employer signed and the chain timestamped. Editing a number breaks the proof. |
| An employer denying a payslip they issued | The signature recovers to the employer's address and the anchor has a block time. |
| The operator losing or altering its database | The employee's download plus the chain is enough to prove every field; the operator is not needed. |
| An operator or insider quietly changing a historic payslip | Any change needs a fresh employer signature and bumps `version` with a `PayslipCorrected` event, which is visible. |
| Proving pay without over-sharing | A tenant proves `net` and `payday`; the landlord learns nothing else. |

## What it does not do

- It does not prove the salary was fair, that tax was handled correctly, or that the employment is real. It proves that this employer committed to these figures on this date.
- It does not replace the legal payslip where the law prescribes a form. The PDF is still issued; the anchor sits behind it.
- It does not make the payout itself more private. The ERC-20 transfers are public, as they are with any wallet payout.

## Privacy, PDPA and GDPR

Salted hashes of individual fields do not reveal the field and are not personal data in the clear. Even so:

- Never anchor names, emails or wallet addresses as plain values. The registry stores only `runId` and `personId` hashes of opaque ids.
- Keep `personId` an internal UUID, never an identity number.
- Allow the salts to be destroyed on request. Once the salts are gone the leaves cannot be recomputed, so the on-chain commitments become uncorrelatable noise. That is how a deletion request is honoured against an immutable chain.
- The document and salts are confidential salary data and sit under the same client scoping as everything else.

## Roadmap

1. **Run-level anchoring** (above) to make large runs cheap.
2. **EAS attestations** as an alternative schema: the same root as an Ethereum Attestation Service attestation with the employer as attester, so wallets and explorers that already understand EAS can display it. The registry stays the canonical store.
3. **Verifiable credential export**: a W3C VC wrapping the disclosure bundle so it can sit in an identity wallet alongside other credentials.
4. **Zero-knowledge range proofs**: "net pay is above X" without revealing the amount. The salted leaf design is ready for it; a Groth16 or Noir circuit over the leaf hash is the next step.
5. **A public verifier page**: paste a bundle, pick the network, see the result. No account, no API key.

## How to use it in this repo

- A payslip is sealed and anchored automatically when every payout in an item reaches its final stage. In demo mode the mock `ChainAdapter` returns a sample transaction hash; on Sepolia it is a real anchor.
- Employer: `GET /v1/clients/:clientId/runs/:runId/payslips/:personId` returns `{ document, leaves, root, docHash, anchorTx, employerSignature }`; `.pdf` on the same path returns the PDF with the anchor details printed on it.
- Employee: `GET /v1/me/payslips` lists payslips with `payslip.root`, `anchorTx` and `explorerUrl`; `GET /v1/me/payslips/:runId/disclose?fields=net,payday` returns the disclosure bundle; `GET /v1/me/payslips/:runId.pdf` the PDF.
- Webhook: `payslip.anchored` fires with `{ runId, personId, root, anchorTx }`.
- Verify by hand: compute `leafHash` and walk the proof with `verifyProof` from `@sera-payroll/core`, or call `PayslipRegistry.verifyField` on a block explorer.

The API routes are specified in [API.md](API.md).
