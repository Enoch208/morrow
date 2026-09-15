# Sablier Lockup stream vault

Status: `live-testnet-mined` for a complete stream sale on the current deployment: wrap, mined refusals, reservation, funding, gated assignment, settlement, seller withdrawal and redemption to the buyer at the stream end. `fork-tested` against the deployed Sablier lockup; `local-tested` for every guard below. Each deployment's actions are journaled separately under [`evidence/stream`](../evidence/stream/).

Morrow's first market is pinned to its own reference vault, and that deployment is left unchanged so its release provenance stays valid. External payouts use a second source contract, `StreamPaymentVault`, and a `MorrowMarket` deployment pinned to it. The market bytecode is identical to the first market apart from its immutables; it settles the stream vault because the stream vault emits the same `SaleReserved`, `SaleAssigned` and `SaleCancelled` events with the same canonical terms encoding.

## What the vault accepts

A stream's current NFT owner calls `wrapStream(streamId, referenceHash)`. The vault takes the Sablier Lockup NFT into its own custody and records a claim only if all of these hold, read from the lockup at that moment:

| Check | Why |
| --- | --- |
| Caller owns the stream NFT, and the vault owns it after transfer | Only the recipient can sell the stream, and the vault then holds exclusive disposal rights: no approval, transfer, burn or withdrawal to another address can be made for it |
| Underlying token equals the vault's pinned source token | The market settles one source token |
| Not cancelable and never cancelled, with zero refunded amount | A cancelable stream lets its sender take back unvested funds after the buyer paid; Sablier cannot make a non-cancelable stream cancelable again |
| Transferable | A non-transferable stream cannot move into custody |
| Not the price-gated model | Its unlock depends on a price condition and may never complete by the end time |
| Not depleted and end time in the future | Maturity is the stream end time; the face value must be positive |

Reservation rejects terms whose buyer is the vault itself, because a claim assigned to the vault could never be paid out.

Face value is the deposited amount minus what had already been withdrawn at wrap time. The seller keeps anything withdrawn before wrapping.

## Redemption

At or after maturity, with no active reservation, anyone may call `redeem(claimId)`. The vault pulls the remaining balance into itself with `withdrawMax`, forwarding any Sablier withdrawal fee paid with the call. The amount Sablier reports withdrawing must equal the change in its own withdrawn accounting. The vault then requires that the stream is depleted and that exactly the face value arrived since wrap. It pays that amount to the current beneficiary with an exact balance-delta check. If the stream was already depleted before the call, no fee is needed and any fee sent is returned to the caller after the payout; if that return fails, the whole redemption reverts.

Sablier lets anyone withdraw vested funds to the NFT owner. Such withdrawals move funds into the vault early; they cannot redirect them, and the redemption accounting counts them. Donations to the vault never create redemption rights.

## Evidence

All deployments use Sablier Lockup v4 on Sepolia at `0xe61cb9153356419bdaD0A8767c059f92d221a3C4`, whose interface was checked function by function against `@sablier/lockup@4.0.1`. Three stream vault deployments exist. Only the third matches the current source; the first two are kept as history.

| Deployment | Vault (Sepolia) | Market (CC3) | Journal | Why it is not current |
| --- | --- | --- | --- | --- |
| First | `0xcE56c5bFA02cC66C73f0D2A736Cf62758769D94f` | `0x6Ab39ab673A141b960DC1d29b47b1774F9665f9D` | [`actions.jsonl`](../evidence/stream/actions.jsonl) | No on-chain vault-as-buyer check, refused stray fees, and its assignment ran behind a weaker gate |
| Second | `0x1cC51E28C6956286418E519895a9Ef9D7D7d1eEb` | `0x9E259Fd6BF1b1715820132dA1A40b7bDd219c0f2` | [`v2/actions.jsonl`](../evidence/stream/v2/actions.jsonl) | Static analysis flagged an unused lockup return value; the run was stopped before any reservation |
| Current | `0x358783c2aC82C2d56b748E55bd6ebFE72A91533c` | `0x4de0e4C567E5CE1A6ffDa95fb539AF6057878025` | [`v3/actions.jsonl`](../evidence/stream/v3/actions.jsonl) | Current |

The current market's CC3 address equals the Sepolia mSRC faucet address because both were created by the payer wallet at the same account nonce on different chains.

### Current deployment

All times are UTC on 2026-09-15. Both runtimes matched the compiled artifacts with immutables masked before any stream was created.

| Step | Time | Transaction | Result |
| --- | --- | --- | --- |
| Deploy vault | 05:21 | `0xbfbf55cd6d2a98a8c3a8456083a414c043f6d671b3b3f2192a10f2b2763775ce` | Sepolia 11707806 |
| Deploy market | 05:21 | `0xd6db7656b54b50b9ae281cfdab8e481e24a46cdd2c6f2804bfa27a45a91b6ad2` | CC3 5490535; pinned to the vault, mSRC, mSET, 50 bps |
| Cancelable stream refused | 05:22 | `0xb6231e1046243159178502f827eed60e383141ab63fb6deb0289c694da54b6d9` | Stream 195; status 0, no logs, replayed as `UnsupportedStream` |
| Stream wrapped | 05:23 | `0xcb877fc11fc516ea95034515691b3953658de3cf119fe396b4dbf7feed15d974` | Non-cancelable stream 196 (10,000 mSRC over 4 hours, created in `0x6658e4146701e0d33fed83e13444dbcc2732a271d90ab7b282acae6773a7ab5a`) becomes claim 1 |
| Vault as buyer refused | 05:24 | `0xf9d5f61641ec9790abc6715a69aba7b5262c8a6a20a1345949a40a825d29d0d8` | Status 0, no logs, replayed as `InvalidBuyer` |
| Reserve | 05:24 | `0x646ae406c7831b67a1b66d1f3c911f60aa72c4c17b1ab980cc1a501cd8454394` | Sepolia 11707820; sale `0x6a4cad260148f26707a8b5b7806d674be24176b498d161df03c3daeeacc0d9fd`, 9,410 mSET |
| Fund with reservation proof | 05:41 | `0x6dd7b4484e0b0dddcdd2c973f990a1cd30de8bf6e415da325ca5e6c036e6cf36` | CC3 5490615; BOUND |
| Assignment gate refused | 05:41 | none | Funding was mined but not yet at a finalized CC3 block: "Exact destination sale is not BOUND" |
| Assign | 05:42 | `0x8937346f5a2e83bfc6e3400301be443c9b5df0941526c3cfdcb4ffcae5a7521f` | Sepolia 11707910, after the full gate passed; the buyer owns the claim |
| Settle with assignment proof | 06:00 | `0xc4ffe65c171cb5f82079971175c865928c0345b5d9bb1030566285996be6b106` | CC3 5490690 |
| Seller withdraws | 06:00 | `0xb7fe9c737db2ddb20830ceeb06f10f33f6b5db94f5a413c0889683487f43e201` | 9,362,950,000 raw mSET to the seller; 47,050,000 raw fee credit remains for the fee recipient |
| Redeem at the stream end | 09:24 | `0x6080f642c68053cfbbbb05ca421c0ffbc719931f67ac844cb6c448924a66102d` | Sepolia 11708995; the vault pulled 10,000 mSRC from Sablier and paid it to the buyer, with no lockup fee; vault backing reads zero |

### Earlier deployments

- **First:** stream 191 was refused (`0xa3397cd869493941a426da59c36f6e1e25e0992185c25a224b55a6b25b19f6bc`, `UnsupportedStream`). Stream 192 was wrapped (`0xead5eb7d789a1dca6bdf4c61cda84fa2037877c6a79ad798ffee1c3e6201460d`), reserved (`0x7804e029eadd20dd0f97b41b056b16ef73cbf526a773b7deefbf17c7f0e4468c`), funded (`0x7d9571ea8851c53db28138b6010b3f30239a091768a80a8b8d7ad007d838890b`), assigned (`0x7a99917f24107ab475d70fb023a1aa21b5e025716752b50f243623a5874bd03f`), settled (`0x7be97f07dd9d6bff2da2c40784368236f8703ce7b7b6e462eb7ad642d6f14af2`) withdrawn by the seller (`0xbb33029e86912b7112a7fc98fe668a5dc1e2913d33386ff7a18e4aebc8ba6837`, 9,362,950,000 raw) and redeemed to the buyer at the stream end (`0xdb11841009f1f90de755d65e501a52c76c68ca98a4e7edae59cf49bb7d05507f`). That assignment ran behind an earlier check that required only BOUND at a finalized CC3 block; chain reads afterwards showed the exact sale bound.
- **Second:** stream 193 was refused (`0x0497521760a1de0c63a4871239153d9f84ace83218605f72963596236fed90a5`), stream 194 was wrapped (`0x77d4c7a541b14e93674387f32843f33abd2ce3477df666efa470b4a7cd565e42`) and a vault-as-buyer reservation was refused with `InvalidBuyer` (`0xd9ab6a59ca8ea7b24fe325cac2a3d3b95f87be3f89cbb2549fe59d119e3a8ef6`). No sale was reserved; the unsold claim was redeemed to the seller at the stream end (`0x49b2e74384ab46578f0f6d7ae7ce50fb456d3726e700baa3d40652e0ac5466ab`).

Local tests: `contracts/test/unit/StreamPaymentVault.t.sol` (wrap guards, cancelled and renounced streams, exclusive custody, third-party withdrawals, two streams on one token, fee forwarding, fee return for depleted streams and its failure path, lockup return checked against its accounting, vault-as-buyer refusal, donations, reserved-claim redemption order, fuzzed entitlement conservation, event compatibility) and `packages/sdk/test/stream-guards.test.ts` (refusal outcome, assignment gate, created-claim binding) and `packages/sdk/test/stream-runs.test.ts` (per-run journals, log scan start, refusal step order). Fork tests against the deployed lockup: `FOUNDRY_PROFILE=fork forge test --root contracts --fork-url <sepolia rpc>` runs `contracts/fork/StreamPaymentVaultSepolia.t.sol`.

## Limits

- **Team-created streams:** every live stream was created by the team payer wallet for the team seller wallet. They are real Sablier streams, but not independently controlled payouts.
- **Sablier trust:** the vault trusts Sablier Lockup's accounting. Every withdrawal asks Sablier's comptroller for a minimum fee, and the comptroller can be replaced by Sablier governance. A faulty or hostile comptroller could make redemption revert or demand an unaffordable fee and so stall it; it cannot redirect the funds.
- **Fee grief (first vault only):** on the first deployed vault, anyone could withdraw the matured remainder to the vault just before a fee-paying redemption, which then reverted with `UnexpectedFee` and had to be retried without a fee. The second vault returns the fee instead.
- **Backing meaning:** `totalBacking` counts face value still held inside Sablier, so the reference vault's `balance >= totalBacking` check does not apply to the stream vault.
- **Self-purchase:** the second stream vault rejects a buyer equal to its own address on chain. The first stream vault and the reference vault do not; for those, only the SDK refuses such terms.
- **Stranded transfers:** a stream NFT sent to the vault with a plain `transferFrom` instead of `wrapStream` creates no claim and cannot be recovered. `safeTransferFrom` to the vault reverts.
- **Test double:** `MockStreamLockup` models linear vesting only, a global fee, no hooks and no null-stream reverts; the fork test covers the deployed lockup for linear streams while its fee is zero.
- **Market freshness:** all three stream markets are `MorrowMarket` deployments, which accept a proof as soon as its block is attested. The attested-depth check in `MorrowMarketV2` covers the Trade page market only; the stream runs waited for Sepolia finality off chain.
- **Browser flow:** the dashboard Trade page does not sell streams. Stream sales run through the journaled CLI, whose seller assignment gate checks chain id, runtime code of the market and vault, market immutables, exact BOUND terms, liability coverage, finalized funding, the open source round and the deadline.
- **Not an audit:** local and fork tests, an internal adversarial review and live evidence are not a security audit.
