// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MarketFixture} from "./MarketFixture.sol";
import {MorrowMarket} from "../../src/destination/MorrowMarket.sol";
import {MarketTypes} from "../../src/destination/MarketTypes.sol";
import {ProofBindingLib} from "../../src/libraries/ProofBindingLib.sol";
import {SaleTermsLib} from "../../src/libraries/SaleTermsLib.sol";
import {AttestcoinGate} from "../../src/libraries/AttestcoinGate.sol";

contract MorrowMarketTest is MarketFixture {
    function test_T20_fundingEntersBoundWithExactPrincipal() public {
        bytes32 id = fund();
        require(market.getSale(id).state == MarketTypes.State.BOUND);
        require(market.totalBound() == 9410 && token.balanceOf(address(market)) == 9410);
        require(market.consumed(keccak256(abi.encode(uint64(1), uint64(99), uint64(7), uint256(0)))));
        solvent();
    }

    function test_T33_T36_nonBuyerCannotConsumeReservation() public {
        vm.expectRevert(MorrowMarket.NotBuyer.selector);
        market.fundReservation(reservation(terms), 0, terms);
        require(market.totalLiabilities() == 0);
        fund();
        solvent();
    }

    function test_T31_changedTermsRejectSameProofAndCanRetry() public {
        AttestcoinGate.ProofEnvelope memory proof = reservation(terms);
        terms.grossPurchasePriceRaw++;
        rejectSubstitutedTerms(proof);
        terms.grossPurchasePriceRaw--;
        terms.seller = address(0xBAD);
        rejectSubstitutedTerms(proof);
        terms.seller = SELLER;
        terms.buyer = address(0xBAD);
        rejectSubstitutedTerms(proof);
        terms.buyer = BUYER;
        terms.feeBps++;
        rejectSubstitutedTerms(proof);
        terms.feeBps--;
        terms.claimId++;
        rejectSubstitutedTerms(proof);
        terms.claimId--;
        terms.round++;
        rejectSubstitutedTerms(proof);
        terms.round--;
        terms.fundBefore++;
        rejectSubstitutedTerms(proof);
        terms.fundBefore--;
        fund();
        solvent();
    }

    function rejectSubstitutedTerms(AttestcoinGate.ProofEnvelope memory proof) private {
        vm.prank(BUYER);
        vm.expectRevert(ProofBindingLib.SaleIdMismatch.selector);
        market.fundReservation(proof, 0, terms);
        require(market.totalLiabilities() == 0 && token.balanceOf(address(market)) == 0);
        require(market.getSale(SaleTermsLib.saleId(terms)).state == MarketTypes.State.ABSENT);
    }

    function test_T35_duplicateFundingDoesNotTakeMoney() public {
        fund();
        vm.prank(BUYER);
        vm.expectRevert(MorrowMarket.SaleAlreadyExists.selector);
        market.fundReservation(reservation(terms), 0, terms);
        require(token.balanceOf(address(market)) == 9410);
        solvent();
    }

    function test_T37_T39_lateAssignmentAllocatesExactlyOnce() public {
        bytes32 id = fund();
        vm.warp(10000);
        market.settleAssignment(outcome(true), 0, id);
        require(market.getSale(id).state == MarketTypes.State.ASSIGNED_CLAIMABLE);
        require(market.credits(SELLER) == 9363 && market.credits(FEE_RECIPIENT) == 47);
        require(market.credits(BUYER) == 0 && market.totalBound() == 0);
        vm.expectRevert(MorrowMarket.SaleNotBound.selector);
        market.settleAssignment(outcome(true), 0, id);
        solvent();
    }

    function test_T38_cancellationRefundHasNoFee() public {
        bytes32 id = fund();
        market.recognizeCancellation(outcome(false), 0, id);
        require(market.getSale(id).state == MarketTypes.State.CANCELLED_CLAIMABLE);
        require(market.credits(BUYER) == 9410);
        require(market.credits(SELLER) == 0 && market.credits(FEE_RECIPIENT) == 0);
        vm.prank(BUYER);
        market.withdraw();
        require(token.balanceOf(BUYER) == 1000000 && market.totalLiabilities() == 0);
        solvent();
    }

    function test_withdrawalOnlyPaysCallerAndCannotRepeat() public {
        bytes32 id = fund();
        market.settleAssignment(outcome(true), 0, id);
        vm.expectRevert(MorrowMarket.NoCredit.selector);
        market.withdraw();
        vm.prank(SELLER);
        market.withdraw();
        require(token.balanceOf(SELLER) == 9363 && market.credits(SELLER) == 0);
        vm.prank(SELLER);
        vm.expectRevert(MorrowMarket.NoCredit.selector);
        market.withdraw();
        solvent();
    }

    function test_fundingCutoffIsStrictButNeverAnExit() public {
        vm.warp(terms.fundBefore);
        vm.prank(BUYER);
        vm.expectRevert(MorrowMarket.FundingClosed.selector);
        market.fundReservation(reservation(terms), 0, terms);
        require(market.totalLiabilities() == 0);
    }
}
