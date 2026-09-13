// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ProofBoundaryFixture} from "./ProofBoundaryFixture.sol";
import {MorrowMarket} from "../../src/destination/MorrowMarket.sol";
import {MarketTypes} from "../../src/destination/MarketTypes.sol";
import {MarketTerms} from "../../src/destination/MarketTerms.sol";
import {ProofBindingLib} from "../../src/libraries/ProofBindingLib.sol";
import {SaleTermsLib} from "../../src/libraries/SaleTermsLib.sol";
import {AttestcoinGate} from "../../src/libraries/AttestcoinGate.sol";
import {EvmV1Decoder} from "@gluwa/asc-contracts/contracts/common/EvmV1Decoder.sol";

contract ProofBoundaryTest is ProofBoundaryFixture {
    function test_T26_T31_reservationPayloadHashMismatchPreservesIdentityAndCanRetry() public {
        AttestcoinGate.ProofEnvelope memory original = reservation(terms);
        bytes32 originalBytes = keccak256(abi.encode(original));
        rejectReservation(
            original, abi.encode(bytes32(0), abi.encode(terms)), 4, ProofBindingLib.TermsHashMismatch.selector
        );
        SaleTermsLib.Terms memory changed = terms;
        changed.grossPurchasePriceRaw++;
        rejectReservation(
            original,
            abi.encode(SaleTermsLib.termsHash(terms), abi.encode(changed)),
            4,
            ProofBindingLib.TermsHashMismatch.selector
        );
        require(keccak256(abi.encode(original)) == originalBytes);
        fundOriginal(original);
    }

    function test_T26_reservationWrongLengthAndTopicCountsCannotConsumeOriginal() public {
        AttestcoinGate.ProofEnvelope memory original = reservation(terms);
        bytes memory data = EvmV1Decoder.decodeReceiptFields(original.encodedTransaction).receiptLogs[0].data;
        rejectReservation(original, new bytes(671), 4, ProofBindingLib.InvalidEventLayout.selector);
        rejectReservation(original, new bytes(673), 4, ProofBindingLib.InvalidEventLayout.selector);
        rejectReservation(original, data, 3, ProofBindingLib.InvalidEventLayout.selector);
        rejectReservation(original, data, 5, ProofBindingLib.InvalidEventLayout.selector);
        fundOriginal(original);
    }

    function test_T26_T31_assignmentLengthsHashAndTopicCountsRollbackThenRetry() public {
        terminalBoundaries(true);
    }

    function test_T26_T31_cancellationLengthsHashAndTopicCountsRollbackThenRetry() public {
        terminalBoundaries(false);
    }

    function test_T31_selfConsistentUnsupportedTermsReachMarketPolicyWithoutCustodyChange() public {
        AttestcoinGate.ProofEnvelope memory original = reservation(terms);
        for (uint256 i; i < 13; i++) {
            SaleTermsLib.Terms memory candidate = unsupported(i);
            rejectUnchanged(
                abi.encodeCall(MorrowMarket.fundReservation, (reservation(candidate), 0, candidate)),
                MarketTerms.UnsupportedTerms.selector,
                candidate
            );
        }
        fundOriginal(original);
    }

    function rejectReservation(
        AttestcoinGate.ProofEnvelope memory original,
        bytes memory data,
        uint256 topicCount,
        bytes4 errorSelector
    ) private {
        AttestcoinGate.ProofEnvelope memory changed = replaceLog(original, data, topicCount);
        rejectUnchanged(abi.encodeCall(MorrowMarket.fundReservation, (changed, 0, terms)), errorSelector, terms);
    }

    function terminalBoundaries(bool assigned) private {
        bytes32 id = fundOriginal(reservation(terms));
        AttestcoinGate.ProofEnvelope memory original = outcome(assigned);
        bytes32 originalBytes = keccak256(abi.encode(original));
        rejectUnchanged(
            terminalCall(
                replaceLog(original, abi.encode(SaleTermsLib.termsHash(terms), bytes32(uint256(1))), 4), id, assigned
            ),
            ProofBindingLib.InvalidEventLayout.selector,
            terms
        );
        uint256[3] memory lengths = [uint256(0), uint256(31), uint256(33)];
        for (uint256 i; i < lengths.length; i++) {
            rejectUnchanged(
                terminalCall(replaceLog(original, new bytes(lengths[i]), 4), id, assigned),
                ProofBindingLib.InvalidEventLayout.selector,
                terms
            );
        }
        rejectUnchanged(
            terminalCall(replaceLog(original, abi.encode(bytes32(0)), 4), id, assigned),
            ProofBindingLib.TermsHashMismatch.selector,
            terms
        );
        for (uint256 count = 3; count <= 5; count += 2) {
            rejectUnchanged(
                terminalCall(replaceLog(original, abi.encode(SaleTermsLib.termsHash(terms)), count), id, assigned),
                ProofBindingLib.InvalidEventLayout.selector,
                terms
            );
        }
        require(keccak256(abi.encode(original)) == originalBytes);
        require(!market.consumed(eventKey(100)));
        (bool success,) = address(market).call(terminalCall(original, id, assigned));
        require(success && market.consumed(eventKey(100)));
        require(
            market.getSale(id).state
                == (assigned ? MarketTypes.State.ASSIGNED_CLAIMABLE : MarketTypes.State.CANCELLED_CLAIMABLE)
        );
        require(market.totalBound() == 0 && market.totalCredits() == terms.grossPurchasePriceRaw);
        require(market.totalLiabilities() == terms.grossPurchasePriceRaw);
        require(market.credits(SELLER) == (assigned ? 9363 : 0));
        require(market.credits(FEE_RECIPIENT) == (assigned ? 47 : 0));
        require(market.credits(BUYER) == (assigned ? 0 : terms.grossPurchasePriceRaw));
        require(token.balanceOf(address(market)) == terms.grossPurchasePriceRaw);
        require(token.balanceOf(BUYER) == 1000000 - terms.grossPurchasePriceRaw);
        solvent();
    }

    function unsupported(uint256 field) private view returns (SaleTermsLib.Terms memory candidate) {
        candidate = terms;
        if (field == 0) candidate.sourceToken = address(0xBAD);
        if (field == 1) candidate.settlementToken = address(0xBAD);
        if (field == 2) candidate.feeBps++;
        if (field == 3) candidate.feeRecipient = address(0xBAD);
        if (field == 4) candidate.seller = address(0);
        if (field == 5) candidate.buyer = address(0);
        if (field == 6) candidate.claimId = 0;
        if (field == 7) candidate.round = 0;
        if (field == 8) candidate.sourceFaceValueRaw = 0;
        if (field == 9) candidate.grossPurchasePriceRaw = 0;
        if (field == 10) candidate.fundBefore = 0;
        if (field == 11) candidate.fundBefore = candidate.assignBefore + 1;
        if (field == 12) candidate.assignBefore = candidate.maturity;
    }
}
