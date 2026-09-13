# Status

Morrow's contracts are deployed on Sepolia and the Creditcoin CC3 testnet. All four campaign claims are complete, and `pnpm verify:submission` independently re-verifies them with `VERDICT: VERIFIED`.

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
- **Backend tests:** `node scripts/check-backend.mjs` passes all 13 commands (Foundry tests, plus test, typecheck and lint for protocol, SDK, reference and worker). That covers 282 tests: 85 contract, 3 protocol, 90 SDK, 81 reference and 23 worker. Output: [`evidence/local/backend-check-1789308979675.json`](../evidence/local/backend-check-1789308979675.json).
- **Mutations:** 26 selected contract mutations are all killed. Output: [`evidence/local/mutations-1789292743489.json`](../evidence/local/mutations-1789292743489.json).
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

## Not done

- Adapters for existing payout, vesting or invoice systems.
- A campaign with an external participant; all three roles are team-operated.
- A security audit or a fresh-machine release check.

See [Known limitations](KNOWN_LIMITATIONS.md) for the full list.
