# Decisions

This record lists the design and verification decisions behind Morrow, with the reason for each and the limit of what it proves. Protocol details are in [PROTOCOL.md](PROTOCOL.md), requirement status in [REQUIREMENTS_MATRIX.md](REQUIREMENTS_MATRIX.md) and open gaps in [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).

## Protocol identity

### Canonical terms v1

The canonical field order is `protocolVersion, sourceEvmChainId, sourceVault, claimId, round, destinationEvmChainId, destinationMarket, seller, buyer, sourceToken, sourceFaceValueRaw, maturity, settlementToken, grossPurchasePriceRaw, feeBps, feeRecipient, fundBefore, assignBefore`.

Address fields use Solidity `address`, `feeBps` uses `uint16`, and every other numeric field uses `uint256`. In TypeScript every numeric field is a `bigint`, including timestamps and fees. Standard ABI encoding gives 18 static words (576 bytes). Protocol version is 1. The protocol domain is keccak256 of the UTF-8 string `MORROW_FUNDED_PAYMENT_SALE_V1`.

Claim identity uses standard ABI `(uint256,address,uint256)`. Sale identity uses `(bytes32,bytes32,uint256,bytes32)` for protocol domain, claim key, round and terms hash. No deployment address is a placeholder.

Solidity, SDK and the independent reference produce byte-identical 576-byte encodings and the same three hashes against [schemas/vectors/canonical-v1.json](../schemas/vectors/canonical-v1.json) (T61).

### Receipt-local facts, not transaction-wide consumption

Two different source claims may legitimately emit sale events in one batching transaction. Each event key therefore keeps the authenticated receipt-local index, and each selected event is bound to its exact sale. Tests deliver both orders with unchanged per-transaction envelopes, reject index substitution without consuming either fact, and roll back a batch that reserves or cancels the same claim twice (T47). The batching helper is test-only; no live batching feature or additional native proof claim is implied.

## Custody

### Custody and historical outcomes

Source reservation precedes destination funding. Destination funding enters BOUND atomically after native proof verification. Only the matching authentic assignment or cancellation allocates bound funds. There is no time-only refund, administrator outcome, verifier setter or backing sweep (T41). Withdrawal status is separate from the permanent outcome.

Source assignment cannot inspect remote funding. The official seller flow requires a fresh destination preflight; a manually signed assignment can bypass that client safeguard (T55). This limitation is tested, not hidden.

### Round obligations stay independent

An unresolved old cancelled round may still refund after a newer assigned round settles and its seller withdraws, even while two destination deposits exist for one source claim (T42, T57). Tests use exact locally emitted source events and preserve all tracked state and consumption flags on rejected calls (T45). Relayer duplication is modelled as sequential EVM calls (T46); this does not claim mempool or worker reconciliation coverage. The redundant outcome identity and terms checks are mutation-tested together, and that combined mutation is described as such.

The live Claim C (on-chain claim #4) exercises the same rule on testnet: round 1 was reserved and cancelled after its deadline without funding; round 2 was reserved, funded, assigned and settled; the authentic round-1 cancellation proof is refused against round 2 with `SaleIdMismatch`, recorded as an `eth_call` at CC3 block 5480530 (`live-read-verified`).

## Native verification and tooling

Receipts are decoded with the official internal `EvmV1Decoder` from `@gluwa/asc-contracts` 0.2.1, compiled into the receiver. Official documentation gives conflicting deployed decoder addresses, so neither is assumed correct. Native calls use the pinned `INativeQueryVerifier` and the official SDK JSON ABI. Non-IR compilation hit a stack-depth error in the ABI-heavy spike fixture; Solidity 0.8.28 with optimizer runs 200 and via IR compiles and passes its focused tests.

ChainInfo is decoded with the nested `HeightHashResult` tuple from the installed `@gluwa/usc-sdk@0.18.0` ABI, `(uint64 height, bytes32 hash, bool isAttestation, bool exists)`. The attestation frontier is ready only when `exists && isAttestation && height >= sourceBlock`. The finalized CC3 block is pinned and rechecked for reorganization.

Backend dependencies are installed only through the owning workspace, and compiler remappings use pinned packages. Code contains no comments other than Solidity license identifiers. Local tests imply no commit or broadcast.

## Seller preflight

Read-only ABI and pin checks are independent of filesystem and signer configuration. The browser preparation path is exported separately while the CLI subpaths remain. Ethers caching is disabled for browser and CLI RPC providers; canonical block hashes are re-read after state is collected, and destination freshness is revalidated after the final source read (T54). Tests cover real browser bundling and ABI parity, which does not prove wallet integration. The client returns exact calldata and never signs or stores keys.

Source assignment executes only after a finalized BOUND funding receipt, exactly matching terms, verified runtime and backing, and a repeated source read. The first Claim A preflight correctly rejected unfinalized funding; a later fresh preflight passed at CC3 block 5477515 without relaxing the rule (T53). Claim C's first round-2 assignment attempt likewise refused unfinalized funding before a later preflight passed.

## Live campaign operation

The Gate, A and B campaign runs under 0.02 Sepolia ETH and 0.05 CTC cumulative gas caps, immutable deadlines and exact token quantities. Committed deadlines, recipients, amounts and budgets are never changed during recovery.

A bounded scheduler executes only the fixed remaining jobs. It stops rather than resending any prepared, submitted or mined transaction that lacks verified post-state. This conservative stop is explicitly incomplete crash reconciliation, not a claim of full worker delivery.

### Durable transaction identity before broadcast

Public transaction intent and the prepared hash are persisted before signed bytes are sent, not after an RPC response. Signed bytes live only in memory. Orphan locks are checked independently of journal records and stop the run for reconciliation; a missing hash or unchanged nonce never grants permission to resend. Keyless transaction inspection cannot declare application completion. This closes specific duplicate and lost-hash risks; general replacement and post-state recovery remain incomplete (T56).

### Transport failures and reconciliation

Only the exact observed TLS transport error, `ERR_SSL_SSL/TLS_ALERT_BAD_RECORD_MAC`, is classified as bounded-retryable. Native semantic refusals stay terminal, and unresolved submissions still require reconciliation before any retry.

When a transport outage interrupts post-state verification of a mined transaction, recovery is an explicitly authorized, operator-run reconciliation, never a cleared submission lock. The Claim B cancellation (source block 11692492, transaction `0x8b63c45aae7006dc53181b2f081f1d42d6bef471694b02bb9e8d8af5e1cb27e1`) was recorded complete only after exact original calldata, sender and nonce, the canonical receipt and `SaleCancelled` event, and historical state and balance checks passed. Nothing was resent, and the original failure stays in the journal. This recovery is scoped to that cancellation and does not establish general replaced or dropped-transaction handling. Recovery checks are labelled `live-read-verified`; original transaction receipts remain `live-testnet-mined`.

Claim C's two recorded worker stops (the ChainInfo tuple decoding defect and the TLS error before funding) were each reconciled against public chain and intent evidence before exactly one worker restarted. Previous attempts and archived locks are retained. This is operator-assisted recovery, not automatic general crash recovery.

## Continuity witness refresh

At CC3 block 5477784 the archived Claim A assignment envelope failed native continuity verification (`Continuity proof does not match attestation or checkpoint`), while a freshly requested envelope for the same assignment passed. The encoded source transaction and transaction Merkle components were unchanged; only the continuity roots differed. The archived reservation still passes at its actual funding block.

The continuity-only refresh was explicitly approved before it was implemented. The SDK first verifies the original archived envelope; only the exact native continuity-rejection reason permits requesting a fresh official proof for the same transaction hash. Chain key, source block, encoded transaction and every transaction Merkle root, sibling and direction must stay identical, and the fresh native transaction index must equal the archived one. Other errors propagate without refresh, and a refreshed envelope that fails verification cannot be submitted. Original and refreshed envelopes and their block-pinned results are all retained.

For Claim A, the SDK refresh path passed at CC3 block 5477805, followed by independent authenticated-source-event checks at block 5477807. The original envelope is `152ef7b82dec358c0f3546f4cfcc56a2ac03154a826b781c3cfa1d0cc7599eb0`; refreshed envelopes are [9d653606…](../evidence/campaign/a-assign-refresh-1789258255103-9d653606bbca0583c895da30aca41ec22de6af047f800300c30a54bdf008ac84.json) and [3ef0e9bd…](../evidence/campaign/a-assign-refresh-1789278944746-3ef0e9bdd851a713ffefb6d0fb104c1bcd04bf74ba0a1fab63b80ec9139877ed.json), the latter used for settlement in `0x2d08bbcbb4271b0d3ecdfd8a023d04ec1657588f14b2528d7065e29ec13addbe` at CC3 block 5479183 after source redemption (T40). For Claim C, the round-2 assignment has an [original](../evidence/c5/c5-r2-assign-original-1789298513081-34018209ee293525baca3bcc861cd7c2f7e9f0ad7ee5736d6416b46137afd344.json) and a [refreshed](../evidence/c5/c5-r2-assign-refresh-1789306751277-ada05b6a27b54952c1a72d5768fa9e55b004bd4f12c368dacdb864d11f260875.json) envelope; the refreshed one was native-verified before settlement in `0xdec07add81bbd999284a7bfcc7ba8ef8cbfce7ffa5fb392bdea503c063ead44b` at CC3 block 5481045.

No source deadline, custody contract, recipient or amount changed, and timing and redemption guards still precede paid settlement. This is an explicit witness-transport change, not proof that an unchanged native envelope stays valid forever.

## Independent verification

### Historical proofs and payments

Archived proofs are verified against actual historical native state; current native compatibility is reported separately. An envelope used on chain must match mined calldata exactly. A historical observation without a recorded call block may be reconstructed from real block timestamps, but must pass native verification at that block and explicitly disclaim knowledge of the original call block. The read-only checker never substitutes a refreshed proof for an archived envelope.

Token transfers are reconciled against canonical receipts and against RPC balances before and after the whole block, then intermediate balances are reconstructed from ordered logs. Another transaction's same-block movement is never attributed to the transaction under check. Actor and spender approval checks and independently derived gross, net and fee payments are required. This does not establish every intermediate application storage transition or full-release reproducibility.

The independent funding checker does not load `.env` or wallet keys. It uses public testnet RPCs, raw funding calldata and receipts, the official native ABI and an independent manual canonical word encoder. Its result is historical funding evidence, not current ownership or full release verification.

### Source claim and global accounting attribution

Selected source claim and round transitions are verified with exact before/after fields, event bytes and block timestamps. The real `InvalidClaim` response is required before creation. Immutable claim fields and terminal round records must persist through redemption. Another claim's events in the same block are allowed only when global backing and the claim counter reconcile across all vault events; multiple transitions for the selected claim are refused. This handles the real block shared by the Claim A reservation and the Claim B creation without calling its global backing increase a reservation deposit.

### Destination state attribution

Canonical block-boundary reads are compared against an independent destination transition oracle, including each campaign actor's credit and every archived event's consumption flag. Exactly one market event-producing transaction is required in the block; unsupported same-block attribution is refused rather than presenting block-level state as per-transaction state. Only absent versus explicitly false RPC log-removal metadata is normalized; all other fields and exact ABI event bytes are preserved. Source transitions and arbitrary storage-slot proofs are checked separately.

### Candidate identity

A release candidate is bound to a full commit plus exact manifest hashes, and the checker's own source is identified separately so checker code is never attributed to the candidate commit. Source and configuration, deployed custody artifacts and compiler metadata are compared against real bytes, including rejection of substituted deployment runtimes (T60). Earlier deployment records keep their null commit fields rather than being relabelled. Inputs are rechecked after network verification to reject mid-run changes. Passing source and campaign checks does not imply that scenario coverage, rehearsal or submission-artifact gates are complete.

Reproduction builds run in an isolated local clone without role-key files; host and dependency-cache reuse remain a limitation.

### Keyless submission verdict

`pnpm verify:submission` is the root keyless, read-only verifier. It reuses the manifest, release and Claim C independent verification paths, preserves their raw failures and explicit candidate identity, and writes a content-addressed JSON report. Missing evidence is reported as unverified; contradictory evidence fails. The verdict is VERIFIED only when every displayed check passes. Amounts and commitments are recomputed from authenticated data, refusals are replayed from their exact recorded bytes, and late-checkpoint timestamp substitution is rejected on either chain. Claim C lines verify only through the complete independent Claim C check; a purported complete result cannot omit or retain a missing stage.

The Claim A check "CC3 funding precedes Sepolia assignment and is finalized" passes on canonical block ordering plus current finalized-head coverage. It does not claim that funding was already finalized at assignment time: no authenticated record of historical finalization timing exists, present finality and local observation timestamps are never promoted to one, and that stronger property is a known limitation. Current results are in [SUBMISSION_VERIFICATION.md](SUBMISSION_VERIFICATION.md).

## Test scope decisions

Assignment before funding is tested with actual locally emitted source events: the refusal does not burn evidence, and the same proof settles after legitimate funding (T44, T55). The manual source-signing bypass is explicit and is not presented as the official SDK workflow. Synthetic cancellation history is kept distinct from a chronologically executed source cancellation, because differing chain clocks require an explicit assumption rather than silent time reversal (T43).

Recipient-delta rollback and deeper proof-data guards are exercised with actual token behavior and isolated proof fixtures (T49). Duplicate-assignment rollback is preserved, and successful events are checked by exact bytes, not count. Coverage diagnostics use separate temporary builds, keep mapping and compiler warnings, and never force a defensive unreachable-state branch through storage corruption to inflate coverage.

Recovery convergence (T56), UI outage behavior (T58) and every-guard mutation coverage (T62) stay `blocked` until those behaviors are demonstrated.
