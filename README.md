# Morrow

**Sell a locked payout before it unlocks.**

A payer funds a fixed-maturity payout for a recipient in a vault on Sepolia. The recipient sells that future payout early to a buyer who pays on Creditcoin CC3. Neither asset bridges. Only native Attestcoin proofs of source-chain events cross to Creditcoin, and those proofs alone decide where the buyer's money goes.

Morrow is testnet-only. The vault is Morrow's own reference escrow; adapters for external payout systems are not implemented. Test tokens have no monetary value.

## Watch the demo

A narrated walkthrough of the actual application and recorded testnet campaign, including delayed-proof settlement, cancellation, and the Proof Room.

https://github.com/user-attachments/assets/3a40e29c-891c-405f-8d1f-b2c424946862

## How a sale settles

One sale round, one mutually exclusive source outcome, one economically consistent destination outcome. The order is load-bearing:

1. **Reserve on Sepolia.** The current beneficiary reserves a sale round with canonical terms.
2. **Prove the reservation.** The `SaleReserved` event is proven to Creditcoin through the BlockProver precompile.
3. **Buyer funds into BOUND.** The buyer deposits the exact price into `MorrowMarket`, bound to that sale id.
4. **Seller preflight.** The seller client confirms the exact BOUND funding on Creditcoin before signing.
5. **Assign or cancel on Sepolia.** The seller assigns before `assignBefore`, or anyone cancels after it.
6. **Prove the outcome.** The `SaleAssigned` or `SaleCancelled` event is proven to Creditcoin.
7. **Settle.** Assignment credits the seller net of a fee of at most 1% (50 bps deployed). Cancellation refunds the buyer in full with no fee. Withdrawals pay only the caller. At maturity the vault pays the face value to whoever is the beneficiary.

Identities are standard `abi.encode` hashes shared by Solidity, the SDK and an independent reference implementation:

- `claimKey = keccak256(abi.encode(sourceEvmChainId, sourceVault, claimId))`
- `termsHash = keccak256(abi.encode(canonical terms))`
- `saleId = keccak256(abi.encode(protocolDomain, claimKey, round, termsHash))`
- `eventKey = keccak256(abi.encode(attestcoinChainKey, sourceBlockHeight, provenTxIndex, receiptLocalLogIndex))`

## What Morrow refuses

- An authentic proof for a different sale (`SaleIdMismatch`), including a cancelled round's proof replayed against the next round.
- Cancelling a round that has been assigned (`RoundMismatch`), even when the assignment proof is held back past the deadline.
- Any time-based refund of bound funds, admin outcome, recipient change, backing sweep, verifier setter or upgrade path. The deployed contracts have no owner functions, and their bytecode contains no `DELEGATECALL`, `CALLCODE`, `SELFDESTRUCT`, `CREATE` or `CREATE2`.
- A mock verifier. Proofs are checked by the native precompiles at `0x…0FD2` (BlockProver) and `0x…0FD3` (ChainInfo), with the transaction index derived natively.

The source chain cannot read Creditcoin, so the seller preflight is the only protection against assigning before funding exists. A manual signer can bypass it. This and other limits are listed in [Known limitations](docs/KNOWN_LIMITATIONS.md).

## Live testnet campaign

Four claims ran on public testnets against real wall-clock deadlines. The payer, seller and buyer are three distinct wallets, all operated by the Morrow team.

| Claim | Path | Outcome |
| --- | --- | --- |
| Gate claim · #1 | Cancellation | Reservation proven, buyer funded, deadline passed, cancelled, buyer refunded, redeemed |
| Claim A · #2 | Assignment | 10,000 mSRC sold for 9,410 mSET; assignment proof deliberately held back past maturity; settled; seller withdrew 9,362.95 and the fee recipient 47.05; buyer redeemed the face value |
| Claim B · #3 | Cancellation | Cancelled and refunded; an authentic Claim B proof submitted for Claim A was refused with `SaleIdMismatch` |
| Claim C · #4 | Repeat round | Round 1 lapsed unfunded and was cancelled; round 2 was funded, assigned and settled; round 1's proof was refused against round 2 |

Every transaction, proof and caveat is in the [claims ledger](docs/CLAIMS_LEDGER.md). Raw action journals are in [`evidence/campaign`](evidence/campaign) and [`evidence/c5`](evidence/c5).

## Verify it yourself

Requires Node 24, pnpm 10.33.0 and Foundry.

```sh
pnpm install --frozen-lockfile
forge build --root contracts
pnpm verify:submission
```

The command is keyless and read-only. It re-reads Sepolia and Creditcoin through public RPCs and prints `PASS`, `FAIL` or `UNVERIFIED` with an evidence label for each of 26 checks:

- deployed runtime against compiled artifacts
- dispatcher selectors and forbidden opcodes
- chain-derived amounts and independently recomputed identities
- native proofs, withdrawals and the current beneficiary
- the refusals above, market liabilities
- the complete Claim C campaign

It exits **0** only when every check passes, **1** if any check fails and **2** if evidence is missing. The verifier lives in [`packages/reference`](packages/reference), which shares no code with the contracts' SDK or the dashboard. The latest run returned 26 PASS and `VERDICT: VERIFIED`; see [Submission verification](docs/SUBMISSION_VERIFICATION.md) for its scope and report.

## Deployments

| Contract | Chain | Address |
| --- | --- | --- |
| `FundedPaymentVault` | Sepolia (11155111) | [`0xEF6EE2fa664da7D3d710b272850CFAa6Ac73D583`](https://sepolia.etherscan.io/address/0xEF6EE2fa664da7D3d710b272850CFAa6Ac73D583) |
| mSRC test token | Sepolia (11155111) | [`0x77B3e1AE0cad279b8Ad1e7b01a89efd139E1e5E9`](https://sepolia.etherscan.io/address/0x77B3e1AE0cad279b8Ad1e7b01a89efd139E1e5E9) |
| `MorrowMarket` | Creditcoin CC3 testnet (102031) | [`0x7c3310280083eE63e32427D11d0A7C2CAf584474`](https://creditcoin-testnet.blockscout.com/address/0x7c3310280083eE63e32427D11d0A7C2CAf584474) |
| mSET test token | Creditcoin CC3 testnet (102031) | [`0xD48Fb19fd5C2Dc98f58484B38E5d54388EceADC0`](https://creditcoin-testnet.blockscout.com/address/0xD48Fb19fd5C2Dc98f58484B38E5d54388EceADC0) |

Compiler artifacts and deployment provenance are in [`deployments/custody`](deployments/custody); ABIs are in [`schemas/abi`](schemas/abi).

## Repository

| Path | Contents |
| --- | --- |
| `contracts` | `FundedPaymentVault`, `MorrowMarket`, `AttestcoinGate`, `ProofBindingLib` and Foundry tests |
| `packages/protocol` | Canonical types, states and evidence labels |
| `packages/sdk` | Canonical encoding, proof binding, seller preflight and campaign runners |
| `packages/reference` | Independent verifier behind `pnpm verify:submission` |
| `apps/worker` | Durable proof transport for the campaign; holds no authority |
| `apps/web` | Landing page and dashboard with live chain reads, attack replay and the Proof Room |
| `evidence` | Action journals, proof archives, manifests and verification reports |

## Development

```sh
pnpm install --frozen-lockfile
node scripts/check-backend.mjs
pnpm --filter @morrow/web dev
```

`scripts/check-backend.mjs` runs the Foundry tests plus test, typecheck and lint for every backend package, and writes its output to `evidence/local`. The web app serves the landing page and the dashboard on `http://localhost:3000`. `pnpm build`, `pnpm lint` and `pnpm typecheck` fan out across all workspaces.

The backend check runs 282 tests: 85 contract, 3 protocol, 90 SDK, 81 reference and 23 worker. The dashboard reads the evidence journals at build time and the chains live in the browser, with no wallet required to inspect anything.

## Documentation

- [Status](docs/STATUS.md)
- [Requirements matrix](docs/REQUIREMENTS_MATRIX.md)
- [Claims ledger](docs/CLAIMS_LEDGER.md)
- [Decisions](docs/DECISIONS.md)
- [Protocol interface](docs/PROTOCOL.md)
- [Submission verification](docs/SUBMISSION_VERIFICATION.md)
- [Known limitations](docs/KNOWN_LIMITATIONS.md)
