# Dashboard trade flow

Status: `local-tested` for the browser action layer and dashboard build; `live-read-verified` for the public deployment at https://morrow-inky.vercel.app/dashboard/trade; `live-testnet-mined` for the same action layer driven by `packages/sdk/src/trade-cli.ts` with the team wallets. No external wallet has used the Trade page.

## What a wallet can do

`/dashboard/trade` runs a new sale on the first deployment (vault `0xEF6EE2fa664da7D3d710b272850CFAa6Ac73D583`, market `0x7c3310280083eE63e32427D11d0A7C2CAf584474`). Campaign claims #1–#4 stay read-only.

| Step | Who signs | Chain | Guard before signing |
| --- | --- | --- | --- |
| Get test tokens | Any wallet | Sepolia or CC3 | Faucet runtime pinned; 24-hour cooldown and faucet balance read first |
| Approve vault, lock payout | Payer | Sepolia | Separate recipient, positive amount, maturity at least one hour ahead, exact allowance and balance |
| Reserve sale | Seller (current beneficiary) | Sepolia | Next round, live claim fields, market fee rules read from the market |
| Get proof, approve, fund | Buyer | CC3 | Reservation finalized on Sepolia and attested on CC3; proof verified against the BlockProver precompile; source still reserved; exact allowance; sale absent |
| Assign | Seller | Sepolia | The existing live seller preflight: funds BOUND at a finalized CC3 block, terms and liabilities match |
| Settle or refund with proof | Anyone | CC3 | Assignment or cancellation proof verified; sale BOUND |
| Cancel expired reservation | Anyone | Sepolia | Round still reserved at or after the assignment deadline |
| Withdraw | The credited wallet | CC3 | Credits read first; success reported only after credits re-read as zero |
| Redeem | Anyone | Sepolia | Matured, unredeemed, no active reservation; pays the current beneficiary |

Every prepared transaction is simulated at one pinned block, carries its expected signer and chain, and is rejected if the wallet's account or network differs or the preparation is older than two minutes. Each sale card derives its step from live reads of both chains and shows only the step the connected wallet may take.

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

## RPC choice

The dashboard reads Sepolia through `https://rpc.sepolia.ethpandaops.io`. The previous public endpoint returned `null` for Claim A's reservation receipt and only 4 of the vault's 18 logs, which would make browser proof checks report real transactions as missing. A second candidate rate-limited parallel browser reads with HTTP 429.

## Limits

- **Wallet signing is not user-observed:** the Trade page is publicly deployed, but no browser wallet signed through it in this evidence. The live Claim #5 run used the identical preparation functions from Node with the team keys.
- **One buyer per reservation:** the seller enters the buyer's address; there is no quote book.
- **Stream sales:** the Trade page does not yet support the Sablier stream deployment; stream sales run from the journaled CLI described in [the stream vault document](STREAM_VAULT.md).
