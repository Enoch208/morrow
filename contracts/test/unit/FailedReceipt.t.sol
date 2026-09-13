// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {RoundReplayFixture} from "./RoundReplayFixture.sol";
import {SaleTermsLib} from "../../src/libraries/SaleTermsLib.sol";
import {AttestcoinGate} from "../../src/libraries/AttestcoinGate.sol";
import {MarketTypes} from "../../src/destination/MarketTypes.sol";
import {EvmV1Decoder} from "@gluwa/asc-contracts/contracts/common/EvmV1Decoder.sol";

contract FailedReceiptTest is RoundReplayFixture {
    function test_T25_failedReservationCannotMoveMoneyOrConsumeEvidence() public {
        SaleTermsLib.Terms memory terms = createTerms();
        vm.recordLogs();
        vm.prank(SELLER);
        bytes32 id = vault.reserveSale(terms.claimId, terms);
        AttestcoinGate.ProofEnvelope memory proof = capturedProof();
        vm.chainId(102031);
        bytes32 beforeState = fullSnapshot(terms.claimId, id);
        for (uint256 empty = 0; empty < 2; empty++) {
            AttestcoinGate.ProofEnvelope memory failed = failedReceipt(proof, empty == 1);
            vm.prank(BUYER);
            vm.expectRevert(AttestcoinGate.FailedReceipt.selector);
            market.fundReservation(failed, 0, terms);
            require(fullSnapshot(terms.claimId, id) == beforeState);
            require(!market.consumed(eventKey(proof)));
        }
        vm.prank(BUYER);
        require(market.fundReservation(proof, 0, terms) == id);
        require(market.getSale(id).state == MarketTypes.State.BOUND);
        require(keccak256(abi.encode(market.getSale(id).terms)) == keccak256(abi.encode(terms)));
        require(market.totalBound() == 9410 && market.totalLiabilities() == 9410);
        require(settlement.balanceOf(address(market)) == 9410 && market.totalCredits() == 0);
        require(market.consumed(eventKey(proof)));
        assertAccounting();
    }

    function test_T25_failedAssignmentPreservesBoundFundsAndAuthenticRetry() public {
        verifyOutcome(true);
    }

    function test_T25_failedCancellationPreservesBoundFundsAndAuthenticRetry() public {
        verifyOutcome(false);
    }

    function verifyOutcome(bool assigned) private {
        SaleTermsLib.Terms memory terms = createTerms();
        bytes32 id = fundedRound(terms);
        AttestcoinGate.ProofEnvelope memory proof = assigned ? assignSource(terms) : cancelSource(terms);
        bytes32 beforeState = fullSnapshot(terms.claimId, id);
        for (uint256 empty = 0; empty < 2; empty++) {
            AttestcoinGate.ProofEnvelope memory failed = failedReceipt(proof, empty == 1);
            vm.prank(RELAYER_A);
            vm.expectRevert(AttestcoinGate.FailedReceipt.selector);
            if (assigned) market.settleAssignment(failed, 0, id);
            else market.recognizeCancellation(failed, 0, id);
            require(fullSnapshot(terms.claimId, id) == beforeState);
            require(!market.consumed(eventKey(proof)));
        }
        vm.prank(RELAYER_B);
        if (assigned) market.settleAssignment(proof, 0, id);
        else market.recognizeCancellation(proof, 0, id);
        require(market.consumed(eventKey(proof)));
        require(market.totalBound() == 0 && market.totalLiabilities() == 9410);
        require(market.totalCredits() == 9410 && settlement.balanceOf(address(market)) == 9410);
        if (assigned) {
            require(market.getSale(id).state == MarketTypes.State.ASSIGNED_CLAIMABLE);
            require(market.credits(SELLER) == 9363 && market.credits(FEE) == 47);
            require(market.credits(BUYER) == 0);
            withdrawCredit(SELLER);
            withdrawCredit(FEE);
        } else {
            require(market.getSale(id).state == MarketTypes.State.CANCELLED_CLAIMABLE);
            require(market.credits(BUYER) == 9410);
            require(market.credits(SELLER) == 0 && market.credits(FEE) == 0);
            withdrawCredit(BUYER);
        }
        require(market.totalLiabilities() == 0 && settlement.balanceOf(address(market)) == 0);
        assertAccounting();
    }

    function failedReceipt(AttestcoinGate.ProofEnvelope memory original, bool empty)
        private
        pure
        returns (AttestcoinGate.ProofEnvelope memory proof)
    {
        proof = abi.decode(abi.encode(original), (AttestcoinGate.ProofEnvelope));
        (uint8 txType, bytes[] memory chunks) = abi.decode(proof.encodedTransaction, (uint8, bytes[]));
        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(proof.encodedTransaction);
        if (empty) receipt.receiptLogs = new EvmV1Decoder.LogEntry[](0);
        chunks[2] = abi.encode(uint8(0), receipt.receiptGasUsed, receipt.receiptLogs, receipt.receiptLogsBloom);
        proof.encodedTransaction = abi.encode(txType, chunks);
    }

    function fullSnapshot(uint256 claimId, bytes32 id) private view returns (bytes32) {
        return keccak256(
            abi.encode(
                snapshot(claimId, id, bytes32(0)),
                settlement.allowance(BUYER, address(market)),
                settlement.totalSupply(),
                settlement.balanceOf(RELAYER_A),
                settlement.balanceOf(RELAYER_B),
                source.balanceOf(address(this)),
                source.allowance(address(this), address(vault))
            )
        );
    }
}
