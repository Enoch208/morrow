# Dashboard trade flow

Status: `local-tested` for the browser action layer and dashboard build; `live-read-verified` for the public deployment at https://morrow-inky.vercel.app/dashboard/trade; `live-testnet-mined` for the same action layer driven by `packages/sdk/src/trade-cli.ts` with the team wallets, including a settled sale on the attested-depth market. No external wallet has used the Trade page.

## What a wallet can do

`/dashboard/trade` runs a new sale between the reference vault `0xEF6EE2fa664da7D3d710b272850CFAa6Ac73D583` on Sepolia and `MorrowMarketV2` `0x375fDD3C43Fc4e0d8E8b2BeCBccd0f0CDA71D479` on CC3. Campaign claims #1–#4 and Claim #5 used the first market `0x7c3310280083eE63e32427D11d0A7C2CAf584474` and stay read-only.

| Step | Who signs | Chain | Guard before signing |
| --- | --- | --- | --- |
| Get test tokens | Any wallet | Sepolia or CC3 | Faucet runtime pinned; 24-hour cooldown and faucet balance read first |
| Approve vault, lock payout | Payer | Sepolia | Separate recipient, positive amount, maturity at least one hour ahead, exact allowance and balance |
| Reserve sale | Seller (current beneficiary) | Sepolia | Next round, live claim fields, market fee rules read from the market |
| Get proof, approve, fund | Buyer | CC3 | Reservation finalized on Sepolia, attested on CC3 with 64 attested blocks on top; proof verified against the BlockProver precompile; source still reserved; exact allowance; sale absent |
| Assign | Seller | Sepolia | The existing live seller preflight: funds BOUND at a finalized CC3 block, terms and liabilities match |
| Settle or refund with proof | Anyone | CC3 | Assignment or cancellation proof verified with 64 attested blocks on top; sale BOUND |
| Cancel expired reservation | Anyone | Sepolia | Round still reserved at or after the assignment deadline |
| Withdraw | The credited wallet | CC3 | Credits read first; success reported only after credits re-read as zero |
| Redeem | Anyone | Sepolia | Matured, unredeemed, no active reservation; pays the current beneficiary |

Every prepared transaction is simulated at one pinned block, carries its expected signer and chain, and is rejected if the wallet's account or network differs or the preparation is older than two minutes. Each sale card derives its step from live reads of both chains and shows only the step the connected wallet may take.

## Attested-depth market

`MorrowMarketV2` keeps the first market's sale rules and adds three checks before it trusts a source proof:

- **Depth:** the latest Sepolia height attested on Creditcoin, read from the ChainInfo precompile, must be at least the proof's block height plus 64. A proof that is attested but shallower reverts with `InsufficientAttestedDepth` and changes nothing; the same proof is accepted once the frontier moves. No proof is ever rejected for arriving late.
- **Source chain:** the proof's chain key must be 1, and ChainInfo must report chain key 1 as EVM chain 11155111.
- **Recorded verification:** proofs go through `verifyAndEmit`, so every accepted proof leaves the native `TransactionVerified` log in the market transaction.

The first market, its libraries and their pinned artifacts are unchanged. `MorrowMarketV2` has its own gate and binding libraries, and every market test suite plus the lifecycle invariants run against both markets. Deployment `0xf40bcf9606f3390c9a0e061d3ce3572c28ad9f36184b81dbc90fa20cecc63f9a` (CC3 block 5491342) was checked after mining: runtime matches the compiled artifact with immutables masked, and the five immutables equal mSET, the reference vault, mSRC, the payer as fee recipient and 50 bps ([journal](../evidence/market-v2/actions.jsonl)).

## Test funds

Each faucet pays 20,000 test units per address every 24 hours, has no owner and no sweep, and was funded with 400,000 units.

| Faucet | Address | Deployment | Funding |
| --- | --- | --- | --- |
| mSRC (Sepolia) | `0x4de0e4C567E5CE1A6ffDa95fb539AF6057878025` | `0x234a79c1c03d368044447d38c06c759c9b04565ba937cea1738258ebeb8a4990` | `0x9a0ec16a6d2f6a9db199458fc739fb87065df9018cf5b2de01f634433ad80a12` |
| mSET (CC3) | `0x5dAC910797f35F1baEED282f753DE4803484ad3B` | `0x1008b886f07b04197e52d4a6907f9d761db40ec6e8b2ba089b8bdfe8a62d6bfb` | `0x1d6cff04e2ec1b39e13adb7de6ef34ea74fed2593b1e4139cf7084341846f8b3` |

Gas (Sepolia ETH and tCTC) still comes from public faucets.

## Claim #5: live run through the browser action layer

Payer, seller and buyer are the three team wallets. Every step below was prepared by the browser SDK functions the Trade page calls and journaled in [`evidence/trade/actions.jsonl`](../evidence/trade/actions.jsonl).

| Step | Chain | Transaction | Result |
| --- | --- | --- | --- |
| Buyer faucet drip | CC3 | `0x4b36caea44fa7fae2f3846f53b942d6f16759d3136b998774a3d7fbdd8d298a8` | 20,000 mSET |
| Lock payout | Sepolia | `0xd7ffdb9b178ab3f140f036ce0a5eb2348506b9ce6ccbd792fe3a2b8a347f7a1e` | Claim 5, 10,000 mSRC for the seller |
| Reserve | Sepolia | `0x0ec27ee858d54ca0d8910ec68b803d2e6419f9cea28c946ad7d7b81349b96976` | Sale `0x8d82e28958800531a19c4ba281316c6f332da3e5ff8fe9a7f9f84106b0a34904`, 9,410 mSET, assign before 22:34:24 UTC |
| Fund with proof | CC3 | `0x6f90a1fffbfed1f974cf2dba270f5b6fa62beaac9971fc19d2d4f4ec598f8487` | BOUND |
| Assign | Sepolia | none | The seller preflight refused at 04:23 UTC: the assignment deadline had passed. The operator had paused the run for approval of an unrelated deployment and resumed after the window closed |
| Cancel expired reservation | Sepolia | `0xa8b5f801149d8c983f15fe6e490d5b70a35d3fba67db734c5ddbdc1068d7ec96` | Round cancelled. A first attempt failed on a TLS error before broadcast; round state and seller nonce were checked unchanged on two RPCs before retrying, and the retry's receipt was read after a client timeout |
| Refund with proof | CC3 | `0xfc13f2283b189be175e1fcd70e463fce6444fad6b13c28d0057d896262eba164` | Cancellation recognized, zero fee |
| Buyer withdraws | CC3 | `0x1c94f9fc6ef3a3e2d6c6b608e524b80964425107ba28e981bd3b831a87cf6e90` | 9,410 mSET returned to the buyer; credits re-read as zero |
| Redeem | Sepolia | `0xdbc499b9bb2aea1f25cf4d61b37d333d0689620ab16a0d85a723bff1ccdd743a` | 10,000 mSRC paid to the seller, who still owned the claim |

This run demonstrates the cancellation and full-refund path end to end. It is not a completed sale.

## Claim #6: live sale on the attested-depth market

Payer, seller and buyer are the three team wallets, and every step used the browser action layer from `packages/sdk/src/trade-cli.ts` ([journal](../evidence/trade/v2/actions.jsonl)). All times are UTC on 2026-09-15.

| Step | Time | Transaction | Result |
| --- | --- | --- | --- |
| Lock payout | 08:55 | `0x8ed09d57245a77a7983fc5a9e2a2025646de26bbf609d35b148b2275df3e9e1d` | Claim 6, 10,000 mSRC for the seller |
| Reserve | 08:56 | `0x3168788acf18af5a6b6ad8e5b0863a6d976901a92db307f54b5b16238b58b118` | Sepolia 11708853; sale `0x169980aa41209b763085b643dce455c888a48fb72b90abff012539fb1d71b5e1`, 9,410 mSET |
| Shallow proof refused | 09:05 | `0xcc1e54925565ce6056bf5db6150d9a1952580f8e1351fc3c8834ddb532092894` | CC3 5491431; the real reservation proof with the frontier at 11708860, below the required 11708917; status 0, no logs, replayed as `InsufficientAttestedDepth` |
| Third party verifies the proof first | 09:16 | `0x0962fca0eeb90e1a049eaf4fc00db843f8e5b3b719daa6a01590b5bac8fc835c` | CC3 5491475; the payer wallet called `verifyAndEmit` directly with the reservation proof; the precompile emitted `TransactionVerified` for Sepolia block 11708853 |
| Fund with the same proof | 09:17 | `0x9fb94e585cbedc60aa938646903fc8851468e368212e6d9740b34a145fa692c3` | CC3 5491477; BOUND, with the native `TransactionVerified` log in the same transaction. An earlier direct verification did not block funding |
| Assignment preflight refused | 09:17 | none | Funding was not yet at a finalized CC3 block |
| Assign | 09:18 | `0xaf767789dbd0b31c3f88b913ad0f3b5483fd04879196fef2913327b3a29614d5` | Sepolia 11708964, after the seller preflight passed; the buyer owns the claim |
| Settle with assignment proof | 09:40 | `0xaf41d4af1373e98d1a4e24deed953cf94b854ab44a0dbf3033136a7aed5180e4` | CC3 5491567, once the frontier passed Sepolia 11709028; the SDK waited one more attempt until a finalized CC3 block showed the depth |
| Seller withdraws | 09:40 | `0x178544ad99e225e77aaaa9b7d624d1eb876c7264851c955889d993c49bd6bfe3` | 9,362,950,000 raw mSET |
| Fee recipient withdraws | 09:40 | `0xcd302ae594b934a5aa961ba2b4780e6cfa5baedbb9b6a249573f48c805095825` | 47,050,000 raw mSET; the market then reads zero bound, zero credits, zero liabilities and a zero token balance |
| Redeem at maturity | 12:58 | `0x0ae79381fcaa50254f0843e38b4aab1cef7300f9d3aea7a362d142530acc4f21` | Sepolia 11710010, after the 12:55:38 maturity; 10,000 mSRC paid to the buyer, and the claim reads redeemed. The follow-up progress read timed out and is journaled as unavailable |



## RPC choice

The dashboard reads Sepolia through `https://rpc.sepolia.ethpandaops.io`. The previous public endpoint returned `null` for Claim A's reservation receipt and only 4 of the vault's 18 logs, which would make browser proof checks report real transactions as missing. A second candidate rate-limited parallel browser reads with HTTP 429.

## Limits

- **Wallet signing is not user-observed:** the Trade page is publicly deployed, but no browser wallet signed through it in this evidence. The live Claim #5 run used the identical preparation functions from Node with the team keys.
- **One buyer per reservation:** the seller enters the buyer's address; there is no quote book.
- **Earlier markets:** the first market and the three stream markets accept a proof as soon as its block is attested; only the Trade page market enforces attested depth on chain.
- **Stream sales:** the Trade page does not yet support the Sablier stream deployment; stream sales run from the journaled CLI described in [the stream vault document](STREAM_VAULT.md).
