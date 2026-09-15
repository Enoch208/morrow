# Status

## Trade page, attested-depth market, faucets and stream sales — 15 September 2026

- **Attested-depth market:** `MorrowMarketV2` on CC3 (`0x375fDD3C43Fc4e0d8E8b2BeCBccd0f0CDA71D479`) trusts a source proof only when 64 further Sepolia blocks are attested, its chain key resolves to Sepolia through ChainInfo, and `verifyAndEmit` records it. Its runtime and immutables were checked after deployment. The first market and its pinned artifacts are unchanged. See [Dashboard trade flow](TRADE_FLOW.md).
- **Claim #6 on that market:** a live sale reserved, recorded a mined `InsufficientAttestedDepth` refusal of the real reservation proof, survived a third party calling `verifyAndEmit` with the same proof first, funded, passed the seller preflight, assigned, settled and paid the seller 9,362,950,000 raw and the fee recipient 47,050,000 raw. The market then held no liabilities, and the claim redeemed its 10,000 mSRC to the buyer at maturity.
- **Trade page:** `/dashboard/trade` lets wallets lock a payout, reserve, fund with a proof, pass the seller preflight, assign, settle or refund, withdraw and redeem. It is live at the public alias as Vercel deployment `dpl_Hcsmx2h9eiNkkD3aJpP6zB9ff4fi`, built from a clean archive of `e510211104467525de3bce8722e57c1ec81a0c0b` and pointed at `MorrowMarketV2`; public routes returned 200, the Trade page rendered with no console errors, and its bundle carries the V2 market address. No browser wallet has signed through it yet.
- **Claim #5:** the same browser action layer ran a sale on the first market that missed its assignment window and completed the cancellation, full buyer refund and seller redemption on chain.
- **Faucets:** mSRC on Sepolia and mSET on CC3 each pay 20,000 units per address per 24 hours, with no owner.
- **Sablier streams:** the current stream vault completed a live sale of a non-cancelable Sablier Lockup v4 stream, from wrap through settlement to redemption of 10,000 mSRC to the buyer at the stream end, with mined `UnsupportedStream` and `InvalidBuyer` refusals. See [Sablier Lockup stream vault](STREAM_VAULT.md).
- **Real proof fixtures:** three proof envelopes the live market consumed are committed and run through both binding libraries; each yields the event key the market emitted and fails when a log index, term, emitter, signature or byte changes.
- **Checks:** `node scripts/check-backend.mjs` passed all 13 commands with 437 tests (188 contract, 3 protocol, 123 SDK, 95 reference, 28 worker): [report](../evidence/local/backend-check-1789463951165.json). The lifecycle invariants now also check that consumed events stay consumed and that every sale has its consumed reservation. [30 selected mutations](../evidence/local/mutations-1789460987203.json) were all killed, including attested depth, its boundary, chain binding and `verifyAndEmit`. Slither 0.11.6 reports no High or Medium findings across six contract targets. Two fork tests pass against the deployed Sablier lockup.

## Current proof-continuity health — 14 September 2026

The backend-owned live-health verifier now refreshes only the continuity witness for both archived attack envelopes, rejects any change to the source transaction hash or authenticated proof components, and rebuilds both native and market calls from the refreshed envelope. `pnpm verify:health` returned [17 PASS, 0 FAIL, 0 UNVERIFIED](../evidence/blobs/b0eedaad884661c216c74300f480ef7c0a7c06b01ff68a20d596af329bf6f2ab.json) at CC3 block 5487036. The wrong-sale proof returned `SaleIdMismatch`; the old-round proof returned `SaleNotBound` against current terminal state, while its recorded-block replay independently retained `SaleIdMismatch`. This health observation is read-only `eth_call` evidence; the separate mined campaign is documented below.

The focused reference package run passed typecheck, lint and 95 tests. The fresh CC3 refusal campaign is mined and state-preserving: replay (`SaleAlreadyExists`), wrong sale (`SaleIdMismatch`), old round (`SaleNotBound`) and stale proof (continuity mismatch) each have status-0, zero-log receipts in `evidence/mined-refusals/actions.jsonl`. This checkout result is not yet deployed to the public Proof Room and remains separate from the archived 26-check submission verifier.

## Direct live-health release — 14 September 2026

The existing Proof Room and read-only API are deployed at the existing Vercel alias. Implementation `bf9296ba306f9acdd63f3d103ccdd3d61b8c6f5e` and release pin `56fc9b9f6ae1035b394a25872f727696478ced09` are published. GitHub CI passed all four jobs on follow-up commit `d0a2a9d6997c489aff54dd37814593541e38157d`. Static provenance passes with zero issues. The first full submission attempt overlapped release commits and correctly rejected the changed checker identity; the frozen-pin rerun is separate.

Changed: direct-browser live health, refresh and relative timestamps, GET-only Next API, pure proof-input decoder, scoped API evidence tracing, Vercel build configuration. Tests: 299 backend tests across all 13 backend commands; 11 public SDK tests and 4 registrar tests; 26 integrity/static/secret-scanning regressions; root build, lint and typecheck. Public API reads and refusal status codes passed. The public browser refresh smoke test passed in 114.4 seconds. Fresh health is 15 PASS / 0 FAIL / 2 UNVERIFIED, not 26/26. Archived proofs reproduce at recorded blocks but not current native continuity.

The frozen-pin submission run completed on 14 September at 07:52 UTC: 26 PASS, 0 FAIL, 0 UNVERIFIED, exit 0; report `evidence/blobs/ca6018650e557daa9193ce783d27acd2abc7bcf8b6b6823b018a008d6c782dca.json`. The earlier overlapping run is retained separately and is not counted as passing. This includes historical replays, not 26 current-block attacks.

The 15-page whitepaper v1.2 includes the new full report and keeps its existing PDF URL. The public SDK is MIT-licensed and published on npm as `@morrow-protocol/sdk`. GitHub CI is public and passing. The backend checkout now has a 17/0/0 health observation and mined refusal evidence, but the public Proof Room still serves the prior deployment until the frontend lane publishes this release. An external-custody payout adapter remains blocked: no eligible team-controlled Sablier/VestingWallet position was found, so no unsupported deployment or fabricated integration is claimed.

Morrow's contracts are deployed on Sepolia and the Creditcoin CC3 testnet. All four campaign claims are complete. The archived submission report is verified; this is not a claim that every current rerun passes.

## Live-health and integration increment — 14 September 2026

- `pnpm verify:health`: [15 PASS, 0 FAIL, 2 UNVERIFIED](../evidence/blobs/b62f3fa8d459e3ebbfa1216556d4197c7b91451518e74deb9b099a906da15425.json). Current runtime hashes for both custody contracts and both tokens match; current accounting is backed. Two historical wrong-sale/old-round attacks reproduce with native acceptance. Their archived envelopes do not establish current continuity.
- `node scripts/check-backend.mjs`: [all 13 commands passed](../evidence/local/backend-check-1789352246899.json), with 297 tests in the runner's scope: 85 contracts, 3 protocol, 90 internal SDK, 91 reference, 28 worker. Public SDK and CI-helper tests are additional, separately measured scopes.
- Read-only API: [local HTTP claim, sale and settlement responses](../evidence/blobs/67de4c30869162187f3c3bd2ea6b6be3f5cf737e7b55c2fcafba76a5abdfe4b1.json) returned 200 with live finalized-block identities and no-store headers. The GET-only API is also deployed through the public Vercel application.
- CI: all four GitHub jobs passed on `d0a2a9d6997c489aff54dd37814593541e38157d`; offline integrity verifies 70 distinct artifacts. [26 selected mutations killed](../evidence/local/mutations-1789352020131.json). [Slither](../evidence/local/static-analysis/run-02Yxxa/summary.json) retains 7 Low and 7 Informational findings, with no High/Medium findings.
- Release caveat: the in-progress root script and lockfile differ from the pinned submission commit. A diagnostic build also left different compiler remappings; `forge build --root contracts --force` removed that generated-output discrepancy, and all three custody artifacts then matched the pinned compiler artifacts. The current source-provenance check still fails on the intentionally changed root script/lockfile. Do not waive it; pin and reverify a new release after authorized commits.
- Blocked: frontend-lane confirmation before wiring the existing Proof Room, npm login/scope authority before publishing, a second verified CC3 RPC, and production API deployment. The new health surface has 17 checks, not the separate submission verifier's 26.

Fresh-check caveat, 14 September 2026: during [public web deployment](../deployments/web/README.md), two keyless verifier runs encountered TLS transport errors. The latest returned 7 PASS, 0 FAIL and 19 UNVERIFIED ([report](../evidence/blobs/89ed94109a9c19289ac94379ceb57ae10dc8bcf57a4888e2daa08fb2ab01fb62.json)). The all-pass results below are archived observations, not a fresh all-pass result today. Public hosting and the read-only browser smoke test passed.

## Delivery gates

| Gate | Status | Evidence label | Evidence |
| --- | --- | --- | --- |
| Custody contracts deployed with pinned provenance | Complete | `live-read-verified` | Runtime matches compiled artifacts in [`deployments/custody`](../deployments/custody/) |
| G1B: real `SaleReserved` → native proof → mined `fundReservation` → exact BOUND funds | Complete | `live-testnet-mined` | Gate claim · #1 in the [claims ledger](CLAIMS_LEDGER.md) |
| Gate claim: cancellation, refund, redemption | Complete | `live-testnet-mined` | [Claims ledger](CLAIMS_LEDGER.md) |
| Claim A: sale, held-back assignment proof, late settlement, withdrawals, redemption | Complete | `live-testnet-mined` | [Claims ledger](CLAIMS_LEDGER.md) |
| Claim B: cancellation, refund, authentic wrong-sale proof refused | Complete | `live-testnet-mined` | [Claims ledger](CLAIMS_LEDGER.md) |
| Claim C: repeat round, old-round proof refused, settlement, withdrawals, redemption | Complete | `live-testnet-mined` | [Claims ledger](CLAIMS_LEDGER.md) |
| Independent live verification | Complete | `live-read-verified`, `historical-replay` | [Submission verification](SUBMISSION_VERIFICATION.md) |
| Public web hosting | Complete | `live-read-verified` | [Live demo](https://morrow-inky.vercel.app); cloud build and unauthenticated route/asset checks passed on 14 September 2026 |

## Claim C

Claim C is on-chain claim #4, one funded payout sold across two rounds. All times are UTC on 2026-09-13.

| Step | Time | Transaction | Block |
| --- | --- | --- | --- |
| Payout funded in vault | 08:18:43 | [`0x4072736e…d3f80179`](https://sepolia.etherscan.io/tx/0x4072736e91ff391f66bf35b1361d958c677cbe1960c076f5d8349be0d3f80179) | Sepolia 11694696 |
| Round 1 reserved | 08:19:16 | [`0x985bdddf…e6a07a83`](https://sepolia.etherscan.io/tx/0x985bdddfb82461b1875db785c6280a4a3457dcd17f216104ef6ed82fe6a07a83) | Sepolia 11694699 |
| Round 1 cancelled after its deadline, never funded | 10:30:27 | [`0xace2eba6…eb940f7e2d`](https://sepolia.etherscan.io/tx/0xace2eba674a6a9374364d84c5de16bc42967361ee4f12bcb61aa84eb940f7e2d) | Sepolia 11695327 |
| Round 2 reserved | 10:30:40 | [`0xd94f6b5b…33e8cfe`](https://sepolia.etherscan.io/tx/0xd94f6b5b3a6a8a5135e002999d4f62f8ff2483772bc119a3d3208130733e8cfe) | Sepolia 11695328 |
| Round 2 funded, BOUND | 11:12:52 | [`0xc851050b…4776bccf`](https://creditcoin-testnet.blockscout.com/tx/0xc851050b97a00532e4a00ba8393d3e809f42202b3d64255a1ad1d26e4776bccf) | CC3 5480448 |
| Round 2 assigned after seller preflight | 11:13:54 | [`0xc6a7e7be…b8848ce5`](https://sepolia.etherscan.io/tx/0xc6a7e7be2adbee54a5a3bb58bb9036958dd3e0561422a2add1bfd609b8848ce5) | Sepolia 11695536 |
| Round 1 cancellation proof refused for round 2, `SaleIdMismatch` | 11:33:58 | `eth_call`, not mined | CC3 5480530 |
| Redeemed at maturity | 13:30:40 | [`0xf1fb9bd6…6172fe48`](https://sepolia.etherscan.io/tx/0xf1fb9bd6fc3189a84099bbfdd88b909028e5c6feab0d075a10a37ae16172fe48) | Sepolia 11696200 |
| Round 2 settled | 13:42:34 | [`0xdec07add…3ead44b`](https://creditcoin-testnet.blockscout.com/tx/0xdec07add81bbd999284a7bfcc7ba8ef8cbfce7ffa5fb392bdea503c063ead44b) | CC3 5481045 |
| Seller withdrew 9,362,950 raw | 13:42:49 | [`0x77cb4c78…24256a98`](https://creditcoin-testnet.blockscout.com/tx/0x77cb4c78170d566e49bb900ce6afbf71b61127340eede9fec64a918624256a98) | CC3 5481046 |
| Fee recipient withdrew 47,050 raw | 13:43:04 | [`0x61a36371…36c337f2`](https://creditcoin-testnet.blockscout.com/tx/0x61a36371eb4b9e65bd3da98c9040adc355f13c2c25a520547df832b336c337f2) | CC3 5481047 |

The action journal is [`evidence/c5/actions.jsonl`](../evidence/c5/actions.jsonl). After all four claims, market liabilities, credits and bound funds read zero, and the vault holds no unredeemed backing.

## Verification and tests

- **Live verification:** `pnpm verify:submission` returned 26 PASS, 0 FAIL, 0 UNVERIFIED and exit 0. See [Submission verification](SUBMISSION_VERIFICATION.md).
- **Backend tests:** `node scripts/check-backend.mjs` passes all 13 commands (Foundry tests, plus test, typecheck and lint for protocol, SDK, reference and worker). That covers 437 tests: 188 contract, 3 protocol, 123 SDK, 95 reference and 28 worker. Output: [`evidence/local/backend-check-1789463951165.json`](../evidence/local/backend-check-1789463951165.json).
- **Mutations:** 30 selected contract mutations are all killed. Output: [`evidence/local/mutations-1789460987203.json`](../evidence/local/mutations-1789460987203.json).
- **Coverage:** critical custody sources report 201/201 lines, 28/28 functions and 40/41 branches. Output: [`evidence/local/coverage-1789292695437.json`](../evidence/local/coverage-1789292695437.json).
- **Web app:** typecheck, lint and production build pass.

## Dashboard

The web app in `apps/web` renders the campaign from the evidence journals and reads both chains live in the browser. No wallet is needed to inspect anything.

- **Claims:** per-claim timelines, with each Sepolia milestone checked against the ChainInfo attestation precompile.
- **Proof Room:**
  - the canonical sale in load-bearing order
  - one-click `eth_call` replays of every recorded refusal
  - the native verifier and the market judging identical proof bytes differently
  - a live bytecode check that the contracts expose no admin path
  - the attestation frontier
- **Seller preflight:** a connected seller wallet can run it in the browser before assigning.
- **Trade:** wallets can run a new sale on the first deployment; campaign claims stay read-only.

## Not done

- Adapters for payout, vesting or invoice systems other than Sablier Lockup streams.
- A campaign with an external participant; all three roles are team-operated.
- A security audit or a fresh-machine release check.

See [Known limitations](KNOWN_LIMITATIONS.md) for the full list.
