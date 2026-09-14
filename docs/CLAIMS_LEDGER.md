# Claims ledger

## Direct presentation release — 14 September 2026

The Proof Room live-health report has 17 checks, separately scoped from the archived 26-check submission report. The deployed browser and API observed 15 PASS, 0 FAIL and 2 UNVERIFIED; both recorded-block attacks passed and both current native-continuity checks remained unavailable. Public API claim/sale/settlement reads returned 200, health returned 503, and a public browser refresh test passed without wallet access. This is not a new trade, an audit or a fresh 26/26 claim. The reviewed local implementation and pin were deployed to Vercel without a GitHub push; new CI and npm publication are still pending.

Every public claim Morrow makes, with its evidence label, where the evidence lives, and what it does not prove. Evidence labels are limited to: `proposed`, `local-tested`, `abstract-model`, `fork-tested`, `live-read-verified`, `live-testnet-mined`, `historical-replay`, `user-observed`, `blocked`.

Sepolia (EVM 11155111) transaction hashes resolve on `https://sepolia.etherscan.io/tx/<hash>`; Creditcoin CC3 testnet (EVM 102031) hashes resolve on `https://creditcoin-testnet.blockscout.com/tx/<hash>`. All amounts are raw token units. All times are UTC.

## Standing caveats

- New live health is a 17-check subset plus selected replays, not a fresh 26/26 full release claim. The [14 September observation](../evidence/blobs/b62f3fa8d459e3ebbfa1216556d4197c7b91451518e74deb9b099a906da15425.json) is 15 PASS and 2 UNVERIFIED. Current proof continuity remains unverified for the archived attack envelopes.
- Local HTTP API responses, SDK tarballs and CI definitions are not evidence of public hosting, npm publication or passing remote CI. Those release steps remain separate.

- All campaigns run on public testnets with test tokens. No test token has monetary value, and no amount here is revenue or buyer principal in any real currency.
- The payer, seller and buyer are three distinct addresses, all operated by the Morrow team. No third party has traded.
- `historical-replay` means a past call or proof re-checked against a recorded block. It does not mean the same proof is valid for continuity today.
- Refusals recorded as `eth_call` are not mined reverted transactions.
- Nothing here is an audit, a production-readiness claim or a third-party endorsement.

## Deployments and actors

| Claim | Label | Evidence | Caveat |
| --- | --- | --- | --- |
| `FundedPaymentVault` is deployed on Sepolia at `0xEF6EE2fa664da7D3d710b272850CFAa6Ac73D583`; `MorrowMarket` on CC3 at `0x7c3310280083eE63e32427D11d0A7C2CAf584474`; source test token `0x77B3e1AE0cad279b8Ad1e7b01a89efd139E1e5E9`; settlement test token `0xD48Fb19fd5C2Dc98f58484B38E5d54388EceADC0` | live-testnet-mined | [deployments/custody/provenance-1789252172280.json](../deployments/custody/provenance-1789252172280.json); [evidence/custody/actions.jsonl](../evidence/custody/actions.jsonl) | Testnet deployments only |
| Deployed creation code, runtime code and configuration match the compiled artifacts | live-read-verified | Same provenance record; re-checked by `pnpm verify:submission` | Archived compiler artifacts are matched against compiler outputs, settings and source hashes; not an audit |
| Deployed runtimes route exactly the published ABI selectors and contain no DELEGATECALL, CALLCODE, SELFDESTRUCT, CREATE or CREATE2 | live-read-verified | `pnpm verify:submission` (dispatcher and opcode checks) | Static bytecode inspection, not formal verification |
| Campaign actors: payer/fee recipient `0x9DDB9007583a7b9DF073B65bCE820f77D6E2365D`, seller `0xB9e1914C0844d9cd0188AdFFc10e3Bd6A633D12c`, buyer `0x8c48477bd205B0007d32A45ea3b7aE27745FDfbE` | live-read-verified | Stored sale terms in [evidence/campaign/actions.jsonl](../evidence/campaign/actions.jsonl) and [evidence/c5/actions.jsonl](../evidence/c5/actions.jsonl) | Distinct wallets, all team-operated |

## Integration spike

| Claim | Label | Evidence | Caveat |
| --- | --- | --- | --- |
| A native Attestcoin proof caused the exact constrained state change on CC3 | live-testnet-mined | CC3 tx `0xc3893570f720da0f7530cf34631249b724826c92968fe869181a2d951c91cee6`, block 5477357; [evidence/spike/actions.jsonl](../evidence/spike/actions.jsonl) | Fixture amount 23 is not money or buyer principal |
| Finalized accepted total is 23 | live-read-verified | [evidence/spike/report-1789251576509.json](../evidence/spike/report-1789251576509.json), CC3 block 5477360 | Read of the mined spike, not another transaction |
| A native-valid proof from an unapproved emitter is rejected with `WrongEmitter` | live-read-verified | Proof SHA-256 `19c228bd147cdbcb433622f43ac351aaa1c25e9b6f7c02045ab449c8e035ff9d`; spike action log | `eth_call` refusal, not a mined revert |
| Spike runtime and creation provenance match compiled artifacts | live-read-verified | [deployments/spike/provenance-1789251012134.json](../deployments/spike/provenance-1789251012134.json) | Provenance record carries no repository commit; immutable values checked separately |
| Native verification accepts historical source bytes | historical-replay | [evidence/native-read/d0862fa25181db5bfc6b8aa480fd8535f996e28dac24c5c54646c3176aed0f78.json](../evidence/native-read/d0862fa25181db5bfc6b8aa480fd8535f996e28dac24c5c54646c3176aed0f78.json) | Historical read, not a trade |

## Gate claim (claim #1): cancellation and refund

saleId `0xf1d9e03ea44e90946e61981fd385a0acdf90104aa05c8b2f36916d0043e1435a`. Face 10,000,000; gross price 9,410,000. Evidence: [evidence/campaign/actions.jsonl](../evidence/campaign/actions.jsonl).

| Claim | Label | Evidence | Caveat |
| --- | --- | --- | --- |
| Claim created and round reserved on Sepolia | live-testnet-mined | Create `0xca07ff5a275597579df0a7bec1e8f01822671ff009f122c2143530accbf067f4` (block 11691857); reserve `0x6960905b2cfa146d12bc3d18ee9df8d93eeb8bd7a352901cb0e0ffec654c2981` (block 11691862) | Stored terms match canonical SDK bytes |
| A native reservation proof funds a BOUND sale with exact buyer funds on CC3 (the G1B gate) | live-testnet-mined | Fund `0x4bfeaaee1cec83f2ec7494bf652cac8921b7913721006af2993c2b68fab07795`, CC3 block 5477466; proof hash `96c1fab8936efbb35aa8281c2865decb1c11609ce906490fc250c4975efee348` | Gate claim only |
| Independent raw-data funding checks pass | live-read-verified | [evidence/independent/funding-4bfeaaee1cec83f2ec7494bf652cac8921b7913721006af2993c2b68fab07795-1789253374871.json](../evidence/independent/funding-4bfeaaee1cec83f2ec7494bf652cac8921b7913721006af2993c2b68fab07795-1789253374871.json) | Historical funding block only |
| Expired round cancelled on source; cancellation proof refunds the buyer in full | live-testnet-mined | Cancel `0xd20d492700c17c96dff46da99477775e7c337f023333361abfeaf38f05d782e3` (Sepolia 11692419); refund `0x33d03c4e920993c9ebe457346f03c4f1b66155b9a081189cd1212de9bbf6cfe6` (CC3 5477919); buyer withdrew 9,410,000 in `0x5955161fbcc81cf395fec42ca0da51a7ea5b02e494e8600428b15e413aca977c` (CC3 5477921) | Zero fee on cancellation |
| Seller redeems the unsold claim at maturity | live-testnet-mined | Redeem `0xc23aeb5841c3648f4b8a595455b5ea430e1062f362733a76b9b003359a99a8a5` (Sepolia 11693991) | |

## Claim A (claim #2): full sale, held-back assignment proof, redemption

saleId `0x68c0b70a12bbbec19f1413c90de99efc6336c6f0f002dc397e1955a672d61692`. Face 10,000,000,000; gross price 9,410,000,000; fee 50 bps; maturity 2026-09-13 04:00. Evidence: [evidence/campaign/actions.jsonl](../evidence/campaign/actions.jsonl).

| Claim | Label | Evidence | Caveat |
| --- | --- | --- | --- |
| Claim created and round reserved | live-testnet-mined | Create `0xea4a3817c6b3b4299e0d04e8ed8b1ded0dc458011efe18026cc30174ea69aeb9` (Sepolia 11691914); reserve `0xb6a57d0c78b8bc7e223ff45eceb012316ddb16a71e1eacf591580c3e5ca0fc12` (Sepolia 11691929) | |
| Buyer funds straight into BOUND from the reservation proof | live-testnet-mined | Fund `0x85dbf790f02a40e1b03a39a43c3345fb5e34c1674141b4680d457c24fb6b719f` (CC3 5477514); proof hash `719d6a4799d9d4effedb60239ecc69c8c8aa45ef284e6bd69b6011d90662ce48` | |
| Seller preflight refuses unfinalized funding, then passes and the seller assigns on source | live-testnet-mined | Preflight recorded at finalized CC3 block 5477515; assign `0xf761898b50db1081955f52aaab4cf02891b4b0586a299ab60d0c206cce0e5028` (Sepolia 11691974) | Preflight is SDK-side; the source vault cannot read Creditcoin (see [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)). The submission verifier checks that CC3 funding precedes the Sepolia assignment and is finalized; it does not claim funding was finalized at assignment time, because no authenticated historical finalization-time record exists |
| Cancelling the assigned round is refused with `RoundMismatch` | live-read-verified | `cancelExpiredSale(2, 1)` at Sepolia block 11691986 | `eth_call`, not a mined revert |
| The source claim redeems to the buyer at maturity before the assignment proof reaches CC3 | live-testnet-mined | Redeem `0x84d435b1a5e853ea19473b01ce5fbed934b5da40deb92213a23e4cdd2248744b` (Sepolia 11693999); current beneficiary `0x8c48477bd205B0007d32A45ea3b7aE27745FDfbE` | |
| A continuity-only refresh keeps the authenticated source components unchanged | live-read-verified | SDK path at CC3 block 5477805; independent native and source-event verification at block 5477807 in [evidence/blobs/68c27f06fb947fb8501ebcf0e1e3633b9396efe91147a1c7611900a535f0f4f6.json](../evidence/blobs/68c27f06fb947fb8501ebcf0e1e3633b9396efe91147a1c7611900a535f0f4f6.json); original and refreshed archives [a-assign-1789254577056](../evidence/campaign/a-assign-1789254577056-152ef7b82dec358c0f3546f4cfcc56a2ac03154a826b781c3cfa1d0cc7599eb0.json), [a-assign-refresh-1789258255103](../evidence/campaign/a-assign-refresh-1789258255103-9d653606bbca0583c895da30aca41ec22de6af047f800300c30a54bdf008ac84.json), [a-assign-refresh-1789278944746](../evidence/campaign/a-assign-refresh-1789278944746-3ef0e9bdd851a713ffefb6d0fb104c1bcd04bf74ba0a1fab63b80ec9139877ed.json) | The refresh was explicitly approved by the team; no funds move during the checks |
| The late assignment proof settles the sale after maturity; the destination accepts it | live-testnet-mined | Settle `0x2d08bbcbb4271b0d3ecdfd8a023d04ec1657588f14b2528d7065e29ec13addbe` (CC3 5479183); proof hash `3ef0e9bdd851a713ffefb6d0fb104c1bcd04bf74ba0a1fab63b80ec9139877ed` | Settlement used a continuity-refreshed proof and documented operational recovery; nothing was blindly resent |
| Seller withdraws 9,362,950,000; fee recipient withdraws 47,050,000 (`floor(9,410,000,000 × 50 / 10,000)`) | live-testnet-mined | Seller `0xf40820d3969308e8907d1120dd5995124ecc2259630be29059004e1c4d4c889f` (CC3 5479187); fee `0x724d4808b219fe838f530f3de5b163965f6cec329f0999a225856802c0fa125c` (CC3 5479190) | Independent settlement-credit deltas and final balances pass |
| A fresh native verification of the Claim A reservation proof still succeeds | historical-replay | `c5-integration-readiness` row in [evidence/c5/actions.jsonl](../evidence/c5/actions.jsonl) | Not a new trade |

## Claim B (claim #3): cancellation, refund, wrong-sale refusal

saleId `0x5075887af502c30798bad388f68596e1f2144e38e1cf19f2851eb10629c7e058`. Face 10,000,000,000; gross price 9,410,000,000. Evidence: [evidence/campaign/actions.jsonl](../evidence/campaign/actions.jsonl).

| Claim | Label | Evidence | Caveat |
| --- | --- | --- | --- |
| Claim created, round reserved and funded into BOUND | live-testnet-mined | Create `0xb99f9dce589c4aae61c3acf1cf110f6ca809d6ab3a79f1f938101f3901e46a82` (Sepolia 11691929); reserve `0x8644bdc30316a06a114dc1a49641a7df19e1335a547eed1361242484bef7c057` (Sepolia 11691931); fund `0x97d1128ed4abd56339b12ccd106d3a763ce88822fc6d6e3d6f2451c5e50a0935` (CC3 5477526) | |
| An authentic, natively valid reservation proof submitted with non-matching sale terms is refused with `SaleIdMismatch` | live-read-verified | Same proof bytes pass native verification and revert `0x17ac2355` (`SaleIdMismatch`): proof `726d59ca4a3066eee8dc1a3fa9407ef08aaf444ebbd1a162d00fe68ae389f75c` at CC3 block 5477525, and proof `a2614da9aec7b18ca4ab86d4a75b94bbad78bf0cdfeccf8ab05240820b408dd8` at CC3 block 5477528 | `eth_call`, not a mined revert. At the latest block the archived envelope fails native continuity first, so only the recorded-block replay shows `SaleIdMismatch` |
| Expired round cancelled; cancellation proof refunds the buyer in full | live-testnet-mined | Cancel `0x8b63c45aae7006dc53181b2f081f1d42d6bef471694b02bb9e8d8af5e1cb27e1` (Sepolia 11692492); refund `0xbf25ef1f32456a1c84c58e0e5996728eff43d2709e8ed4de47c73723899c07e9` (CC3 5479174); buyer withdrew 9,410,000,000 in `0x3ae499c8687776a944175950fee9f7975693891fc75c13c08a70ec1554ef3039` (CC3 5479176) | Zero fee on cancellation |
| Seller redeems the unsold claim at maturity | live-testnet-mined | Redeem `0xb55c2f4a3bf354f8e6b9ad3a60c62cb376e2ff8a7908e86e0db220d1d47d0034` (Sepolia 11694018) | |

## Independent re-verification of gate, A and B

| Claim | Label | Evidence | Caveat |
| --- | --- | --- | --- |
| Keyless manifests re-verify receipts, historical native proofs, deployments, token payments, 12 source transitions and 10 destination transitions (including exact actor credits and event consumption) across gate, A and B | live-read-verified, with historical-replay subresults | [manifest-gate](../evidence/independent/manifest-gate-1789281991292.json), [manifest-a](../evidence/independent/manifest-a-1789282016943.json), [manifest-b](../evidence/independent/manifest-b-1789282007401.json) | Reads of existing trades. Other rounds, reverted transactions, arbitrary storage slots and full release requirements are out of scope. A and B each retain one transient RPC failure before a successful attempt |
| Keyless inspection of the B cancellation and A settlement jobs | live-read-verified | [evidence/recovery/](../evidence/recovery/b-cancel-1789280949805.json) (`b-cancel-*`, `a-settle-*`) | Inspection of existing transactions, not a test of a new broadcast |

## Claim C (claim #4): repeat round on the same claim

One source claim, two rounds. Round 1 saleId `0xc04928b767ce0eb0146c28a1856a3d9ed0997eca773254a910129d8b504a03bf`; round 2 saleId `0xe5a5b7fc56cca3b47802ea4397b80bddb8b5e37b7529151fd5fe13fe9d8befcc`. Face 10,000,000; gross price 9,410,000; fee 50 bps; maturity 2026-09-13 13:30. Evidence: [evidence/c5/actions.jsonl](../evidence/c5/actions.jsonl).

| Claim | Label | Evidence | Caveat |
| --- | --- | --- | --- |
| Claim 4 created with checked backing and token deltas | live-testnet-mined | Create `0x4072736e91ff391f66bf35b1361d958c677cbe1960c076f5d8349be0d3f80179` (Sepolia 11694696) | |
| Round 1 reserved at 08:19:16 and never funded | live-testnet-mined | Reserve `0x985bdddfb82461b1875db785c6280a4a3457dcd17f216104ef6ed82fe6a07a83` (Sepolia 11694699); reservation proof native-verified at CC3 block 5479789, [archive](../evidence/c5/c5-r1-reserve-original-1789288107670-1dc4375ac40238ce0ff1afb02db6bc6af2167ebd9c180a7ff86b6c0b2effd15a.json) | Round-1 funding was deliberately not authorized |
| Round 1 cancelled at 10:30:27, after its 10:30:00 assignment deadline | live-testnet-mined | Cancel `0xace2eba674a6a9374364d84c5de16bc42967361ee4f12bcb61aa84eb940f7e2d` (Sepolia 11695327); cancellation proof [archive](../evidence/c5/c5-r1-cancel-original-1789297798723-9747784e53f2d71d4d8617954de2149768ff3be0fa516f0fe6fbdec07bbc9780.json), native-verified | |
| A later round on the same claim reserves independently of the cancelled round (10:30:40) | live-testnet-mined | Reserve `0xd94f6b5b3a6a8a5135e002999d4f62f8ff2483772bc119a3d3208130733e8cfe` (Sepolia 11695328); reservation proof [archive](../evidence/c5/c5-r2-reserve-original-1789297804996-b83b19aff8a4780534c736e2daceab6af6bd2670f4013c9e947da18815d33ba2.json), native-verified | |
| Round 2 funded into BOUND at 11:12:52 with exact funds | live-testnet-mined | Fund `0xc851050b97a00532e4a00ba8393d3e809f42202b3d64255a1ad1d26e4776bccf` (CC3 5480448); deposit, bound amount, liability and market balance each 9,410,000 | One transport (TLS) failure before the funding broadcast was reconciled by the operator and recorded; recovery was operator-assisted, not automatic |
| Seller preflight refuses unfinalized funding, then passes; round 2 assigned at 11:13:54 | live-testnet-mined | Assign `0xc6a7e7be2adbee54a5a3bb58bb9036958dd3e0561422a2add1bfd609b8848ce5` (Sepolia 11695536) | Same SDK-side preflight limitation as Claim A |
| Round-2 assignment proof native-verified at 11:21:56 | live-read-verified | Proof hash `34018209ee293525baca3bcc861cd7c2f7e9f0ad7ee5736d6416b46137afd344`, [archive](../evidence/c5/c5-r2-assign-original-1789298513081-34018209ee293525baca3bcc861cd7c2f7e9f0ad7ee5736d6416b46137afd344.json) | |
| The authentic round-1 cancellation proof is refused against round 2 with `SaleIdMismatch` (11:33:58) | live-read-verified | `c5-refusal` row: same native proof bytes verify, market call reverts `0x17ac2355` at CC3 block 5480530 (Sepolia 11695567); state unchanged | `eth_call`, not a mined revert |
| Source claim redeems to the buyer at maturity (13:30:40) | live-testnet-mined | Redeem `0xf1fb9bd6fc3189a84099bbfdd88b909028e5c6feab0d075a10a37ae16172fe48` (Sepolia 11696200) | |
| Round 2 settles from the assignment proof (13:42:34) | live-testnet-mined | Settle `0xdec07add81bbd999284a7bfcc7ba8ef8cbfce7ffa5fb392bdea503c063ead44b` (CC3 5481045); continuity-refreshed proof `ada05b6a27b54952c1a72d5768fa9e55b004bd4f12c368dacdb864d11f260875`, [archive](../evidence/c5/c5-r2-assign-refresh-1789306751277-ada05b6a27b54952c1a72d5768fa9e55b004bd4f12c368dacdb864d11f260875.json) | Uses a continuity-only refresh of the original assignment proof, native-verified before settlement |
| Seller withdraws 9,362,950 (13:42:49); fee recipient withdraws 47,050 (13:43:04) | live-testnet-mined | Seller `0x77cb4c78170d566e49bb900ce6afbf71b61127340eede9fec64a918624256a98` (CC3 5481046); fee `0x61a36371eb4b9e65bd3da98c9040adc355f13c2c25a520547df832b336c337f2` (CC3 5481047) | |
| Market credits, liabilities and balance are zero after the final withdrawal | live-read-verified | `c5-withdraw-fee` post-state at CC3 block 5481047 | Snapshot at that block |

## Off-chain code and tests

| Claim | Label | Evidence | Caveat |
| --- | --- | --- | --- |
| Solidity, SDK and reference produce byte-identical canonical identities and hashes | local-tested | [schemas/vectors/canonical-v1.json](../schemas/vectors/canonical-v1.json); protocol, SDK, reference and Solidity tests | Not every possible randomized vector |
| Reserve-first vault and market paths pass focused, fuzz (256 runs per property) and stateful invariant tests (64 runs, depth 32) | local-tested | `forge test --root contracts`; `node scripts/check-backend.mjs` (13 test, typecheck and lint commands); records in `evidence/local/` | Native precompile calls are mocked in local tests; the T44/T55 historical-assignment regression uses real locally emitted source events with mocked native verification; not every interleaving or guard |
| A selected set of 26 guard, outcome-binding and receipt-local identity mutations are all killed | local-tested | [scripts/test-mutations.mjs](../scripts/test-mutations.mjs) and [scripts/mutation-cases.mjs](../scripts/mutation-cases.mjs); results in [evidence/local/mutations-1789292743489.json](../evidence/local/mutations-1789292743489.json) | Selected mutants, not complete mutation coverage |
| Diagnostic coverage of the critical contract set: 201/201 lines, 28/28 functions, 40/41 branches | local-tested | `forge coverage` diagnostic run in [evidence/local/coverage-1789292695437.json](../evidence/local/coverage-1789292695437.json) | Coverage disables the optimizer and viaIR and emits 6,327 anchor warnings; diagnostic only |
| The worker records transaction hashes durably before waiting and handles orphaned submission locks | local-tested | `pnpm --filter @morrow/worker test` | No automatic replacement or general post-state recovery |
| Seller preparation bundles for the browser without Node or key configuration, with compiler ABI parity, uncached reads, canonical snapshots and destination freshness after source re-read | local-tested | `pnpm --filter @morrow/sdk test` | Not a live wallet integration; a seller signing manually can still bypass preflight |
| `pnpm verify:submission` re-checks deployments, runtimes, Claim A identities, amounts, withdrawals, buyer beneficiary, native proof, exact refusal calls, market liabilities and campaign evidence without keys | live-read-verified, with historical-replay subresults | `pnpm verify:submission`; [evidence/release/submission.json](../evidence/release/submission.json); [SUBMISSION_VERIFICATION.md](SUBMISSION_VERIFICATION.md) | Read-only; no new transactions. Not an audit or full release certification. Funding finality at Claim A assignment time is not claimed |
