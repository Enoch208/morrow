# Known limitations

Morrow is a testnet prototype. These are the limits of what it enforces and of what its evidence proves.

## Protocol

- **Preflight bypass:** the source chain cannot read Creditcoin, so it cannot check that a buyer has funded before the seller assigns. The seller preflight is the only protection, and it runs in the SDK and in the browser dashboard. A seller who signs `assignSale` through any other client bypasses it and can give up the claim without payment.
- **No timeout refund:** completion depends on Sepolia, Creditcoin and the Attestcoin proof service staying available. There is no finite proof-delay guarantee. Bound buyer funds have no time-based refund by design; they move only on a proven source outcome.
- **Proof continuity:** an archived native proof envelope is not guaranteed to pass continuity verification at later Creditcoin blocks. Claim A's original assignment envelope failed current continuity verification. It was refreshed continuity-only, which kept the original and rejected any change to its authenticated source components, and settlement then succeeded.
- **Historical proofs:** a reservation proof shows that a reservation happened. It does not prove current ownership or availability.
- **Reference vault only:** the vault is Morrow's own escrow. Adapters for existing payout, vesting or invoice systems are not implemented.

## Campaign

- **Wallets:** the payer, seller and buyer wallets are distinct addresses, all operated by the Morrow team. No external participant took part.
- **Test tokens:** mSRC and mSET have no monetary value. Source backing and purchase capital are separate assets.
- **Worker scope:** the worker is a bounded campaign scheduler, not a general source indexer. It persists each signed transaction's identity before broadcast and stops on orphan locks or unverified submissions. It does not implement:
  - automatic handling of replaced or dropped transactions
  - general post-state recovery
  - account-wide nonce coordination
- **Operator interventions:** the campaign needed operator reconciliation after RPC TLS failures, and after a Creditcoin snapshot reorganization stopped Claim C's first settlement attempt. Failed attempts are retained in the evidence.

## Verification

- **Finality timing:** `pnpm verify:submission` proves that Claim A's CC3 funding block precedes its Sepolia assignment block and is under the current finalized head. It does not prove that the funding had already finalized when the assignment was signed, because no authenticated record of historical finalization time exists.
- **Replays:** `historical-replay` rechecks recorded calls and receipts at their recorded blocks. It does not claim current proof continuity validity.
- **Late cancellation:** the late-cancellation evidence establishes historical proof compatibility and delayed settlement, not private intent to withhold the proof.
- **Transaction attribution:** the independent checker attributes source transitions by requiring one transition for the selected claim per block. It attributes destination transitions by requiring one event-producing market transaction per block.
- **Not an audit:** the bytecode checks compare runtime, dispatcher selectors and forbidden opcodes. They are not a complete control-flow proof or a security audit.
- **Not a fresh-machine run:** verification runs reused an existing dependency and compiler cache.

## Testing

- **Scope:** 282 backend tests pass (85 contract, 3 protocol, 90 SDK, 81 reference, 23 worker). Native precompile calls are mocked only inside local test fixtures. No live mempool-race or arbitrary-interleaving claim is made.
- **Mutations:** 26 selected mutations were all killed. That is not an exhaustive mutation campaign over every guard.
- **Coverage:** instrumented coverage of the critical custody sources reports 201/201 lines, 28/28 functions and 40/41 branches. The unhit branch is `FundedPaymentVault.sol:147`, a round-state recheck that normal transitions cannot reach without storage corruption.
- **Coverage scope:** instrumentation compiles differently from the deployed optimizer/viaIR build, so coverage is not deployed-bytecode coverage. Branch counts do not establish every operand of compound conditions.
- **No state-space model:** no bounded state-space model is published, so no model-checking state counts are claimed.
