# Submission verification

`pnpm verify:submission` independently re-verifies Morrow's deployed contracts and live testnet campaign from public data. It needs no wallet, private key, `.env` file, signing or broadcast.

## Run it

Requires Node 24, pnpm 10.33.0 and Foundry.

```sh
pnpm install --frozen-lockfile
forge build --root contracts
pnpm verify:submission
```

An optional argument selects another public release candidate. The default is [`evidence/release/submission.json`](../evidence/release/submission.json), which pins the implementation commit and the hash of every campaign manifest. The command never manufactures a new release identity.

It prints `MORROW — LIVE SUBMISSION VERIFICATION`, one `PASS`, `FAIL` or `UNVERIFIED` line per check with an evidence label, and a verdict. The full JSON report is saved under `evidence/blobs/`, named by its content hash. Public RPC history can take several minutes.

| Exit | Verdict | Meaning |
| --- | --- | --- |
| 0 | `VERIFIED` | Every check passed |
| 1 | `FAILED` | At least one check contradicts chain data or pinned evidence |
| 2 | `UNVERIFIED` | Evidence is missing or unavailable and nothing failed |

A failure takes precedence over missing evidence, and an empty report cannot verify. Wrong bytes, amounts, identities or receipts fail. Missing files and transport outages can never become a pass.

## Latest result

On 2026-09-13 the command returned **26 PASS, 0 FAIL, 0 UNVERIFIED, `VERDICT: VERIFIED`, exit 0**. Report: [`evidence/blobs/954be668fd213574fb3790563b6c02d684a79f309bb761029354ea8aa362cbd0.json`](../evidence/blobs/954be668fd213574fb3790563b6c02d684a79f309bb761029354ea8aa362cbd0.json).

`VERIFIED` covers exactly the checks listed below. It is not a security audit, a complete control-flow proof, or organizer acceptance.

## What it checks

### Contracts

- **Runtime:** the vault and market runtime bytecode read from each chain matches the provenance-validated compiler output. Only compiler-declared `PUSH32` immutable operands are masked.
- **Dispatcher:** the dispatcher is decoded, and its complete selector set equals the ABI (10 vault functions, 15 market functions).
- **Forbidden opcodes:** executable code contains no `DELEGATECALL`, `CALLCODE`, `SELFDESTRUCT`, `CREATE` or `CREATE2`. PUSH operands and recognized Solidity metadata are skipped. Unsupported dispatcher or metadata forms are reported unverified, never assumed safe.
- **Source consistency:** release sources and compiled artifacts match the pinned candidate commit.

### Claim A

- Face value and buyer funding come from canonical chain state and independently recomputed terms, reconciled against raw receipts, exact token transfers and transaction-local balance changes.
- The CC3 funding block precedes the Sepolia assignment block, and the current finalized CC3 head covers it.
- The native `SaleAssigned` verification replays at its recorded historical CC3 block.
- `saleId`, `termsHash` and round are recomputed by the reference implementation.
- The seller and fee withdrawals match their recorded amounts, and the current source beneficiary is the buyer.

### Refusals

- The authentic Claim B proof submitted for Claim A reverts with `SaleIdMismatch`, and the identical proof bytes are accepted by the native verifier.
- Cancelling Claim A's assigned round reverts with `RoundMismatch`.
- The late cancellation is refused while the exact purchase is still BOUND and a historically accepted assignment proof is unsettled. Both chain checkpoints must be canonical and strictly after the assignment deadline and maturity.

Refusals are `eth_call` rechecks that require the exact observed revert data, not mined reverted transactions.

### Market and Claim C

- **Market:** total liabilities equal credits plus bound funds, read at the current canonical block.
- **Claim C:** funding, assignment, the old-round proof refusal, settlement, both withdrawals and source redemption. Each line passes only when the complete independent Claim C campaign check passes. Incomplete progress and transport failures stay unverified; contradictory native or receipt evidence fails.

## Evidence labels

- `live-read-verified`: read from the current canonical chain state.
- `historical-replay`: an actual recorded call or receipt, rechecked at its recorded block. It does not assert that an archived proof would still pass continuity verification at the latest block.
- `local-tested`: a check over repository files, such as release provenance.

## What it does not prove

- **Finality at assignment time:** the finality check proves ordering and current finality. It does not prove that Claim A's funding had already finalized when the assignment was signed, because no authenticated record of historical finalization time exists.
- **Withholding intent:** late-cancellation evidence establishes historical proof compatibility and delayed settlement, not private intent.
- **Operators:** the campaign wallets are team-operated. See [Known limitations](KNOWN_LIMITATIONS.md).

## Tests

The report logic, bytecode decoding, held-proof selection, Claim A history and Claim C gating are covered by the reference test suite: `pnpm --filter @morrow/reference test`, 81 tests. Regressions reject:

- changed code
- malformed or overlapping immutable ranges
- hidden selectors and forbidden executable opcodes
- substituted proof hashes
- an early destination checkpoint paired with a late source checkpoint
- funding outside the finalized head
