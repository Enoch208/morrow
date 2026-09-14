# Register a funded payout from another contract

`PayoutRegistrar` is a small integration into the existing `FundedPaymentVault`, not another vault implementation and not a new source accepted by the Creditcoin market.

The caller approves the registrar. `register` transfers exactly the face value into the registrar, approves the existing vault, and calls its `createClaim`. Both transfers and claim creation roll back together on failure. After success, the existing vault owns the backing and the named beneficiary owns disposition rights. The registrar has no claim reassignment, withdrawal, cancellation or administration method.

```sh
pnpm install --frozen-lockfile
forge test --root examples/payout-registrar
```

Tests run locally against the actual Morrow vault and local test tokens, including fuzzed principal, invalid maturity rollback, an unfunded caller, and beneficiary-only disposition followed by redemption. No live deployment or transaction is performed. The example constructor accepts a vault address, so an integrator must independently verify the selected vault and supported token; the example is not a general trustless adapter registry.

The currently deployed market recognizes only its pinned Sepolia vault and token. These tests do not establish support for arbitrary external payout custody, production readiness, or an independent audit.
