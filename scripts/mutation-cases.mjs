export const mutationCases = [
  {
    name: "source incoming delta",
    file: "src/source/FundedPaymentVault.sol",
    guard:
      "if (SOURCE_TOKEN.balanceOf(address(this)) != balanceBefore + faceValueRaw) revert TransferDeltaMismatch();",
    test: "test_T02_sourceTaxCannotCreateUnbackedClaim",
  },
  {
    name: "source assignment cutoff",
    file: "src/source/FundedPaymentVault.sol",
    guard: "if (block.timestamp >= round.terms.assignBefore) revert AssignmentExpired();",
    test: "test_T10_T11_assignmentAndCancellationBoundary",
  },
  {
    name: "source cancellation cutoff",
    file: "src/source/FundedPaymentVault.sol",
    guard: "if (block.timestamp < round.terms.assignBefore) revert CancellationTooEarly();",
    test: "test_T12_earlyCancellationRejected",
  },
  {
    name: "buyer authority",
    file: "src/destination/MorrowMarket.sol",
    guard: "if (msg.sender != terms.buyer) revert NotBuyer();",
    test: "test_T33_T36_nonBuyerCannotConsumeReservation",
  },
  {
    name: "destination incoming delta",
    file: "src/destination/MorrowMarket.sol",
    guard:
      "if (SETTLEMENT_TOKEN.balanceOf(address(this)) != beforeBalance + price) revert TransferDeltaMismatch();",
    test: "test_T34_taxedFundingRollsBackMoneyStateAndConsumption",
  },
  {
    name: "funding admission cutoff",
    file: "src/destination/MorrowMarket.sol",
    guard: "if (block.timestamp >= terms.fundBefore) revert FundingClosed();",
    test: "test_fundingCutoffIsStrictButNeverAnExit",
  },
  {
    name: "approved source emitter",
    file: "src/libraries/AttestcoinGate.sol",
    guard: "if (entry.address_ != expectedEmitter) revert WrongEmitter();",
    test: "test_T24_nativeValidUnapprovedEmitterRejected",
  },
  {
    name: "withdrawal credit consumption",
    file: "src/destination/MorrowMarket.sol",
    guard: "credits[msg.sender] = 0;",
    test: "test_withdrawalOnlyPaysCallerAndCannotRepeat",
  },
  {
    name: "claim and round binding",
    file: "src/libraries/ProofBindingLib.sol",
    guard:
      "if (entry.topics[2] != bytes32(terms.claimId) || entry.topics[3] != bytes32(terms.round)) {\n            revert ClaimRoundMismatch();\n        }",
    test: "test_T31_claimAndRoundTopicsMustMatchEvenWithMatchingSaleHash",
  },
  {
    name: "destination deployment binding",
    file: "src/destination/MarketTerms.sol",
    guard:
      "|| terms.destinationEvmChainId != block.chainid || terms.destinationMarket != address(this)",
    test: "test_T32_authenticOtherDestinationCannotFundHere",
  },
  {
    name: "terminal state guard",
    file: "src/destination/MorrowMarket.sol",
    guard: "if (sale.state != MarketTypes.State.BOUND) revert SaleNotBound();",
    test: "test_T37_T39_lateAssignmentAllocatesExactlyOnce",
  },
  {
    name: "combined outcome identity and terms binding",
    file: "src/libraries/ProofBindingLib.sol",
    guard:
      "bindIdentity(entry, terms);\n        if (entry.data.length != 32) revert InvalidEventLayout();\n        if (abi.decode(entry.data, (bytes32)) != SaleTermsLib.termsHash(terms)) revert TermsHashMismatch();",
    replacement: "if (entry.data.length != 32) revert InvalidEventLayout();",
    test: "test_T42_T45_T57_oldRefundDeliveredAfterNewAssignmentStaysRoundSpecific",
  },
  {
    name: "receipt-local event identity",
    file: "src/libraries/AttestcoinGate.sol",
    guard:
      "eventKey = keccak256(abi.encode(proof.chainKey, proof.blockHeight, txIndex, receiptLocalLogIndex));",
    replacement:
      "eventKey = keccak256(abi.encode(proof.chainKey, proof.blockHeight, txIndex, uint256(0)));",
    test: "test_T47_distinctLocalIndicesFundInForwardOrder",
  },
  {
    name: "forbidden assignment proof timeout",
    file: "src/destination/MorrowMarket.sol",
    guard:
      "bytes32 eventKey = ProofBindingLib.outcome(proof, logIndex, sale.terms, SOURCE_VAULT, true);",
    replacement:
      "if (block.timestamp >= sale.terms.assignBefore) revert FundingClosed();\n        bytes32 eventKey = ProofBindingLib.outcome(proof, logIndex, sale.terms, SOURCE_VAULT, true);",
    test: "test_T44_T55_sourceAssignmentBeforeFundingCanRetryWithoutBurningEvidence",
  },
  {
    name: "successful source receipt status",
    file: "src/libraries/AttestcoinGate.sol",
    guard: "if (receipt.receiptStatus != 1) revert FailedReceipt();",
    test: "test_T25_failedAssignmentPreservesBoundFundsAndAuthenticRetry",
  },
  {
    name: "withdrawal recipient delta",
    file: "src/destination/MorrowMarket.sol",
    guard:
      "if (SETTLEMENT_TOKEN.balanceOf(msg.sender) != beforeBalance + amount) revert TransferDeltaMismatch();",
    test: "test_T49_withdrawalRecipientTaxRollsBackEverythingThenPaysOnce",
  },
  {
    name: "redemption recipient delta",
    file: "src/source/FundedPaymentVault.sol",
    guard:
      "if (SOURCE_TOKEN.balanceOf(claim.currentBeneficiary) != recipientBalance + claim.sourceFaceValueRaw) {\n            revert TransferDeltaMismatch();\n        }",
    test: "test_T18_T19_redemptionRecipientTaxRollsBackEverythingThenPaysOnce",
  },
  {
    name: "source constructor domain and token",
    file: "src/source/FundedPaymentVault.sol",
    guard:
      "if (block.chainid != 11155111 || token == address(0) || token.code.length == 0) revert UnsupportedToken();",
    test: "test_sourceConstructorRejectsWrongChainZeroAndCodelessToken",
  },
  {
    name: "source creation token binding",
    file: "src/source/FundedPaymentVault.sol",
    guard: "if (token != address(SOURCE_TOKEN)) revert UnsupportedToken();",
    test: "test_T01_wrongCreationTokenPreservesClaimsBalancesIdsAndAllowances",
  },
  {
    name: "source assignment intent hash",
    file: "src/source/FundedPaymentVault.sol",
    guard: "if (round.termsHash != expectedTermsHash) revert TermsHashMismatch();",
    test: "test_T31_wrongAssignmentHashPreservesActiveRoundThenAuthenticRetryWorks",
  },
  {
    name: "reservation canonical payload binding",
    file: "src/libraries/ProofBindingLib.sol",
    guard:
      "if (keccak256(entry.data) != keccak256(abi.encode(SaleTermsLib.termsHash(terms), abi.encode(terms)))) {\n            revert TermsHashMismatch();\n        }",
    test: "test_T26_T31_reservationPayloadHashMismatchPreservesIdentityAndCanRetry",
  },
  {
    name: "outcome exact payload length",
    file: "src/libraries/ProofBindingLib.sol",
    guard: "if (entry.data.length != 32) revert InvalidEventLayout();",
    test: "test_T26_T31_assignmentLengthsHashAndTopicCountsRollbackThenRetry",
  },
  {
    name: "outcome canonical terms hash",
    file: "src/libraries/ProofBindingLib.sol",
    guard:
      "if (abi.decode(entry.data, (bytes32)) != SaleTermsLib.termsHash(terms)) revert TermsHashMismatch();",
    test: "test_T26_T31_assignmentLengthsHashAndTopicCountsRollbackThenRetry",
  },
  {
    name: "event exact topic count",
    file: "src/libraries/ProofBindingLib.sol",
    guard: "if (entry.topics.length != 4) revert InvalidEventLayout();",
    test: "test_T26_reservationWrongLengthAndTopicCountsCannotConsumeOriginal",
  },
  {
    name: "configured market fee binding",
    file: "src/destination/MarketTerms.sol",
    guard: "|| terms.feeBps != feeBps",
    test: "test_T31_selfConsistentUnsupportedTermsReachMarketPolicyWithoutCustodyChange",
  },
  {
    name: "assignment emits matching source outcome",
    file: "src/source/FundedPaymentVault.sol",
    guard: "emit SaleAssigned(round.saleId, claimId, expectedRound, round.termsHash);",
    replacement: "emit SaleCancelled(round.saleId, claimId, expectedRound, round.termsHash);",
    test: "test_T29_duplicateAssignmentBatchRollsBackAndSingleAssignmentEmitsOnce",
  },
  {
    name: "attested source depth",
    file: "src/libraries/AttestcoinGateV2.sol",
    guard: "latest.height < requiredHeight",
    replacement: "latest.height < proof.blockHeight",
    test: "test_reservationProofNeedsSixtyFourAttestedBlocksOnTop",
  },
  {
    name: "attested source depth boundary",
    file: "src/libraries/AttestcoinGateV2.sol",
    guard: "latest.height < requiredHeight",
    replacement: "latest.height <= requiredHeight",
    test: "test_reservationProofNeedsSixtyFourAttestedBlocksOnTop",
  },
  {
    name: "source chain binding",
    file: "src/libraries/AttestcoinGateV2.sol",
    guard: "chain.info.chainId != SOURCE_CHAIN_ID",
    replacement: "false",
    test: "test_chainKeyMustResolveToSepolia",
  },
  {
    name: "recorded native verification",
    file: "src/libraries/AttestcoinGateV2.sol",
    guard: "verifier.verifyAndEmit(",
    replacement: "verifier.verify(",
    test: "test_proofsAreRecordedThroughVerifyAndEmit",
  },
];
