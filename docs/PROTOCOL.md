# Shared protocol interface

Import runtime constants and types from `@morrow/protocol`. The package exports `SaleTerms`, `Claim`, `SaleRound`, `DestinationSale`, `SaleIdentity`, `EventIdentity`, `SourceEvent`, `EvidenceLabel`, `DisplayState`, `VerificationStatus` and `ReadResult<T>`.

Runtime exports: `saleTermsFields`, `protocolVersion`, `protocolDomainText`, `sourceRoundStates`, `destinationStates`, `evidenceLabels`, `stateLanguage`.

`ProofEnvelope` is also exported, matching the installed native verifier's single-proof interface. It carries the source chain key and block height, authenticated encoded transaction and native Merkle/continuity structures. It has no caller-supplied transaction index; the gate derives that natively.

All on-chain numeric values are bigint. Addresses/hashes use hex string types; these types alone do not validate external input. Transport JSON must explicitly serialize bigint to decimal strings and validate before reconstruction. Missing deployed facts remain unavailable with a reason, not invented addresses or balances.

Destination states are ABSENT, BOUND, ASSIGNED_CLAIMABLE, CANCELLED_CLAIMABLE in Solidity enum order. Source round states are ABSENT, RESERVED, ASSIGNED, CANCELLED. Redemption and withdrawals do not rewrite a sale outcome. `stateLanguage` separates seller credit from payment and buyer refund credit from withdrawal. `ReadResult<T>` keeps pending and unverifiable reads distinct from available data.

Canonical encoding is specified in [Decisions](DECISIONS.md). Compiler-derived source, market and test-token ABIs are exported in [schemas/abi](../schemas/abi/), with SHA-256 hashes and the reproducible `node scripts/export-abis.mjs` command. The source reservation ABI contains canonical terms as bytes; decoding reconstructs the typed `terms` event field. `SaleReserved`, `SaleAssigned` and `SaleCancelled` each index saleId, claimId and round. Deployed custody compiler artifacts and their provenance are in [deployments/custody](../deployments/custody/).
