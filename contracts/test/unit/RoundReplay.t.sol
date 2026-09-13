// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {RoundReplayFixture} from "./RoundReplayFixture.sol";
import {SaleTermsLib} from "../../src/libraries/SaleTermsLib.sol";
import {AttestcoinGate} from "../../src/libraries/AttestcoinGate.sol";
import {ProofBindingLib} from "../../src/libraries/ProofBindingLib.sol";
import {MorrowMarket} from "../../src/destination/MorrowMarket.sol";
import {MarketTypes} from "../../src/destination/MarketTypes.sol";
import {SourceTypes} from "../../src/source/SourceTypes.sol";

contract RoundReplayTest is RoundReplayFixture {
    function test_T42_T45_T57_oldRefundDeliveredAfterNewAssignmentStaysRoundSpecific() public {
        SaleTermsLib.Terms memory terms = createTerms();
        bytes32 first = fundedRound(terms);
        AttestcoinGate.ProofEnvelope memory old = cancelSource(terms);
        require(!market.consumed(eventKey(old)));
        terms.round = 2;
        terms.fundBefore = 1300;
        terms.assignBefore = 1400;
        bytes32 second = fundedRound(terms);
        AttestcoinGate.ProofEnvelope memory assigned = assignSource(terms);
        require(first != second && market.totalBound() == 18820);
        bytes32 beforeState = snapshot(terms.claimId, first, second);
        vm.expectRevert(ProofBindingLib.SaleIdMismatch.selector);
        market.recognizeCancellation(old, 0, second);
        require(snapshot(terms.claimId, first, second) == beforeState);
        vm.prank(RELAYER_A);
        market.settleAssignment(assigned, 0, second);
        require(market.credits(SELLER) == 9363 && market.credits(FEE) == 47);
        require(market.credits(BUYER) == 0 && market.totalBound() == 9410);
        require(market.consumed(eventKey(assigned)) && !market.consumed(eventKey(old)));
        beforeState = snapshot(terms.claimId, first, second);
        vm.prank(RELAYER_B);
        vm.expectRevert(MorrowMarket.SaleNotBound.selector);
        market.settleAssignment(assigned, 0, second);
        require(snapshot(terms.claimId, first, second) == beforeState);
        vm.expectRevert(MorrowMarket.SaleNotBound.selector);
        market.recognizeCancellation(old, 0, second);
        require(snapshot(terms.claimId, first, second) == beforeState);
        withdrawCredit(SELLER);
        withdrawCredit(FEE);
        vm.prank(RELAYER_B);
        market.recognizeCancellation(old, 0, first);
        require(market.credits(BUYER) == 9410 && market.totalBound() == 0);
        require(market.getSale(first).state == MarketTypes.State.CANCELLED_CLAIMABLE);
        require(market.getSale(second).state == MarketTypes.State.ASSIGNED_CLAIMABLE);
        require(market.consumed(eventKey(old)));
        beforeState = snapshot(terms.claimId, first, second);
        vm.prank(RELAYER_A);
        vm.expectRevert(MorrowMarket.SaleNotBound.selector);
        market.recognizeCancellation(old, 0, first);
        require(snapshot(terms.claimId, first, second) == beforeState);
        withdrawCredit(BUYER);
        require(market.totalLiabilities() == 0 && settlement.balanceOf(address(market)) == 0);
        vm.chainId(11155111);
        vm.warp(terms.maturity);
        vault.redeem(terms.claimId);
        backing = 0;
        require(source.balanceOf(BUYER) == 10000 && source.balanceOf(SELLER) == 0);
        require(vault.getRound(terms.claimId, 1).state == SourceTypes.RoundState.CANCELLED);
        require(vault.getRound(terms.claimId, 2).state == SourceTypes.RoundState.ASSIGNED);
        assertAccounting();
    }

    function test_T46_twoCancellationRelayersAllocateAndWithdrawOnlyOnce() public {
        SaleTermsLib.Terms memory terms = createTerms();
        bytes32 id = fundedRound(terms);
        AttestcoinGate.ProofEnvelope memory proof = cancelSource(terms);
        vm.prank(RELAYER_A);
        market.recognizeCancellation(proof, 0, id);
        require(market.consumed(eventKey(proof)) && market.credits(BUYER) == 9410);
        bytes32 beforeState = snapshot(terms.claimId, id, bytes32(0));
        vm.prank(RELAYER_B);
        vm.expectRevert(MorrowMarket.SaleNotBound.selector);
        market.recognizeCancellation(proof, 0, id);
        require(snapshot(terms.claimId, id, bytes32(0)) == beforeState);
        vm.prank(RELAYER_A);
        vm.expectRevert(MorrowMarket.NoCredit.selector);
        market.withdraw();
        require(snapshot(terms.claimId, id, bytes32(0)) == beforeState);
        withdrawCredit(BUYER);
        require(market.totalLiabilities() == 0 && settlement.balanceOf(address(market)) == 0);
        require(market.credits(SELLER) == 0 && market.credits(FEE) == 0);
        require(settlement.balanceOf(RELAYER_A) == 0 && settlement.balanceOf(RELAYER_B) == 0);
        assertAccounting();
    }
}
