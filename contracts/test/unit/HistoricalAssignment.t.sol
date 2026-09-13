// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {RoundReplayFixture} from "./RoundReplayFixture.sol";
import {SaleTermsLib} from "../../src/libraries/SaleTermsLib.sol";
import {AttestcoinGate} from "../../src/libraries/AttestcoinGate.sol";
import {MorrowMarket} from "../../src/destination/MorrowMarket.sol";
import {MarketTypes} from "../../src/destination/MarketTypes.sol";
import {SourceTypes} from "../../src/source/SourceTypes.sol";

contract HistoricalAssignmentTest is RoundReplayFixture {
    function test_T44_T55_sourceAssignmentBeforeFundingCanRetryWithoutBurningEvidence() public {
        SaleTermsLib.Terms memory terms = createTerms();
        vm.recordLogs();
        vm.prank(SELLER);
        bytes32 id = vault.reserveSale(terms.claimId, terms);
        AttestcoinGate.ProofEnvelope memory reservation = capturedProof();
        AttestcoinGate.ProofEnvelope memory assignment = assignSource(terms);
        require(vault.getRound(terms.claimId, 1).state == SourceTypes.RoundState.ASSIGNED);
        require(vault.getClaim(terms.claimId).currentBeneficiary == BUYER);
        require(market.getSale(id).state == MarketTypes.State.ABSENT);
        bytes32 beforeState = snapshot(terms.claimId, id, bytes32(0));
        vm.prank(RELAYER_A);
        vm.expectRevert(MorrowMarket.SaleNotBound.selector);
        market.settleAssignment(assignment, 0, id);
        require(snapshot(terms.claimId, id, bytes32(0)) == beforeState);
        require(!market.consumed(eventKey(reservation)) && !market.consumed(eventKey(assignment)));
        uint256 buyerBefore = settlement.balanceOf(BUYER);
        vm.prank(BUYER);
        require(market.fundReservation(reservation, 0, terms) == id);
        require(market.getSale(id).state == MarketTypes.State.BOUND);
        require(market.totalBound() == 9410 && market.totalLiabilities() == 9410);
        require(market.totalCredits() == 0 && settlement.balanceOf(address(market)) == 9410);
        require(settlement.balanceOf(BUYER) == buyerBefore - 9410);
        require(market.consumed(eventKey(reservation)) && !market.consumed(eventKey(assignment)));
        beforeState = snapshot(terms.claimId, id, bytes32(0));
        vm.expectRevert(AttestcoinGate.WrongEventSignature.selector);
        market.recognizeCancellation(assignment, 0, id);
        require(snapshot(terms.claimId, id, bytes32(0)) == beforeState);
        vm.warp(terms.maturity);
        vm.prank(RELAYER_B);
        market.settleAssignment(assignment, 0, id);
        require(market.getSale(id).state == MarketTypes.State.ASSIGNED_CLAIMABLE);
        require(market.credits(SELLER) == 9363 && market.credits(FEE) == 47);
        require(market.credits(BUYER) == 0 && market.totalBound() == 0);
        require(market.totalCredits() == 9410 && market.totalLiabilities() == 9410);
        require(market.consumed(eventKey(assignment)));
        beforeState = snapshot(terms.claimId, id, bytes32(0));
        vm.prank(RELAYER_A);
        vm.expectRevert(MorrowMarket.SaleNotBound.selector);
        market.settleAssignment(assignment, 0, id);
        require(snapshot(terms.claimId, id, bytes32(0)) == beforeState);
        withdrawCredit(SELLER);
        withdrawCredit(FEE);
        require(settlement.balanceOf(SELLER) == 9363 && settlement.balanceOf(FEE) == 47);
        require(market.totalLiabilities() == 0 && settlement.balanceOf(address(market)) == 0);
        vm.chainId(11155111);
        vault.redeem(terms.claimId);
        backing = 0;
        require(source.balanceOf(BUYER) == 10000 && source.balanceOf(SELLER) == 0);
        require(vault.getRound(terms.claimId, 1).state == SourceTypes.RoundState.ASSIGNED);
        assertAccounting();
    }
}
