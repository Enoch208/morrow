# Morrow SDK

Typed, read-only clients and registration calldata for the deployed Morrow testnet primitive. This package is prepared for the `@morrow-protocol/sdk` name; npm publication is pending scope authentication. It is not the internal seller-preflight or transaction-signing SDK.

## Run from this repository

```sh
pnpm --filter @morrow-protocol/sdk build
node packages/public-sdk/example/read-claim.mjs
pnpm --filter @morrow-protocol/sdk test
```

The example queries Claim A from public Sepolia RPC and needs no wallet, environment file or API key. It exits 2 for unverifiable state, never substitutes an archived claim, and prints raw integers as decimal strings.

## Reads

```js
import { MorrowReadClient } from "@morrow-protocol/sdk";

const client = new MorrowReadClient({ sourceRpcUrl, destinationRpcUrl });
try {
  const claim = await client.readClaim(claimId);
  const sale = await client.readSale(saleId);
  const settlement = await client.readSettlement(saleId);
} finally {
  client.destroy();
}
```

These are callable exports, not signer methods. Results discriminate `available` from `unverifiable`; successful results include the finalized observation block/hash and timestamp. Chain ID, pinned contract runtime and block hash stability are checked. RPC responses remain a trust dependency; this is not a light client. Credits are address-level aggregates, not balances exclusively attributable to one sale. For an absent sale, actor credits are `null`, not invented zeros.

`encodeTerms`, `saleIdentity` and `quoteEconomics` reuse the canonical Morrow encoding. ABI token amounts and deadlines use `bigint`. The public package bundles protocol types and helpers; its only runtime dependency is pinned `ethers`.

## PayoutSourceAdapter

```ts
interface PayoutSourceAdapter {
  readonly sourceChainId: bigint;
  readonly sourceVault: Address;
  readClaim(claimId: bigint): Promise<ReadResult<Claim>>;
  prepareRegistration(input: PayoutRegistration, sourceTimestamp: bigint): PreparedPayoutRegistration;
}
```

`PayoutRegistration` carries the source token, raw face value, beneficiary, maturity and reference hash. `preparePayoutRegistration` returns the exact deployed vault's `createClaim` calldata. It neither approves tokens nor signs/broadcasts. The payer must approve that vault and actually transfer supported tokens through `createClaim`; a caller-supplied timestamp is only a preparation check, and the contract enforces its own current timestamp.

The [contract integration example](../../examples/payout-registrar) forwards real backing into the existing vault, then leaves beneficiary control and maturity redemption to it. **The deployed market pins one source vault and token.** Arbitrary external vaults, vesting contracts, invoices and unbacked promises are not supported by declaring this interface.

## Distribution and scope

ES module JavaScript and bundled TypeScript declarations are emitted to `dist/`. `pnpm pack` builds a whitelist containing only distribution files, this README, the read-only example and package metadata. No keys, environment files, worker code or deployment journals belong in the package.

The package currently declares `UNLICENSED` pending the owner's explicit distribution-license choice. Testnet assets have no monetary value. This package and the registrar example are not audited or production-ready. The deployed protocol's manual source-signing/preflight limitation is unchanged.
