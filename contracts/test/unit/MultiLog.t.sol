// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MultiLogFixture} from "./MultiLogFixture.sol";
import {FundedPaymentVault} from "../../src/source/FundedPaymentVault.sol";
import {MorrowMarket} from "../../src/destination/MorrowMarket.sol";
import {MarketTypes} from "../../src/destination/MarketTypes.sol";
import {SaleTermsLib} from "../../src/libraries/SaleTermsLib.sol";
import {AttestcoinGate} from "../../src/libraries/AttestcoinGate.sol";
import {ProofBindingLib} from "../../src/libraries/ProofBindingLib.sol";

contract MultiLogTest is MultiLogFixture {
    function test_T47_distinctLocalIndicesFundInForwardOrder() public {
        exerciseOrder(0);
    }

    function test_T47_distinctLocalIndicesFundInReverseOrder() public {
        exerciseOrder(1);
    }

    function test_T29_sameClaimCannotEmitDuplicateReservationOrCancellation() public {
        SaleTermsLib.Terms[2] memory pair = createPair();
        bytes32 beforeState = snapshot(pair);
        vm.expectRevert(FundedPaymentVault.NotReservable.selector);
        caller.reservePair(vault, pair[0], pair[0]);
        require(snapshot(pair) == beforeState);
        reservePair(pair);
        beforeState = snapshot(pair);
        vm.chainId(11155111);
        vm.warp(2000);
        vm.expectRevert(FundedPaymentVault.RoundMismatch.selector);
        caller.cancelPair(vault, pair[0].claimId, pair[0].claimId);
        require(snapshot(pair) == beforeState);
        cancelPair(pair);
        require(market.totalLiabilities() == 0);
        assertAccounting();
    }

    function exerciseOrder(uint256 firstIndex) private {
        SaleTermsLib.Terms[2] memory pair = createPair();
        AttestcoinGate.ProofEnvelope memory reserved = reservePair(pair);
        uint256 secondIndex = 1 - firstIndex;
        bytes32 beforeState = snapshot(pair);
        vm.prank(BUYER);
        vm.expectRevert(ProofBindingLib.SaleIdMismatch.selector);
        market.fundReservation(reserved, secondIndex, pair[firstIndex]);
        require(snapshot(pair) == beforeState);
        vm.prank(BUYER);
        vm.expectRevert(AttestcoinGate.LogIndexOutOfRange.selector);
        market.fundReservation(reserved, 2, pair[firstIndex]);
        require(snapshot(pair) == beforeState);
        vm.prank(BUYER);
        market.fundReservation(reserved, firstIndex, pair[firstIndex]);
        require(market.consumed(key(reserved.blockHeight, firstIndex)));
        require(!market.consumed(key(reserved.blockHeight, secondIndex)));
        require(market.totalBound() == pair[firstIndex].grossPurchasePriceRaw);
        beforeState = snapshot(pair);
        vm.prank(BUYER);
        vm.expectRevert(MorrowMarket.SaleAlreadyExists.selector);
        market.fundReservation(reserved, firstIndex, pair[firstIndex]);
        require(snapshot(pair) == beforeState);
        vm.expectRevert(MorrowMarket.NotBuyer.selector);
        market.fundReservation(reserved, secondIndex, pair[secondIndex]);
        require(snapshot(pair) == beforeState);
        vm.prank(BUYER);
        market.fundReservation(reserved, secondIndex, pair[secondIndex]);
        require(market.consumed(key(reserved.blockHeight, 0)) && market.consumed(key(reserved.blockHeight, 1)));
        require(market.totalBound() == 18121 && market.totalLiabilities() == 18121);
        require(settlement.balanceOf(BUYER) == 1e23 - 18121);
        assertAccounting();
        refundPair(pair, secondIndex);
        vm.chainId(11155111);
        vm.warp(3000);
        vault.redeem(pair[0].claimId);
        vault.redeem(pair[1].claimId);
        backing = 0;
        require(source.balanceOf(address(caller)) == 20000);
        assertAccounting();
    }

    function refundPair(SaleTermsLib.Terms[2] memory pair, uint256 firstIndex) private {
        AttestcoinGate.ProofEnvelope memory cancelled = cancelPair(pair);
        uint256 secondIndex = 1 - firstIndex;
        bytes32 first = SaleTermsLib.saleId(pair[firstIndex]);
        bytes32 second = SaleTermsLib.saleId(pair[secondIndex]);
        bytes32 beforeState = snapshot(pair);
        vm.expectRevert(ProofBindingLib.SaleIdMismatch.selector);
        market.recognizeCancellation(cancelled, secondIndex, first);
        require(snapshot(pair) == beforeState);
        market.recognizeCancellation(cancelled, firstIndex, first);
        require(market.consumed(key(cancelled.blockHeight, firstIndex)));
        require(!market.consumed(key(cancelled.blockHeight, secondIndex)));
        require(market.credits(BUYER) == pair[firstIndex].grossPurchasePriceRaw);
        require(market.totalBound() == pair[secondIndex].grossPurchasePriceRaw);
        beforeState = snapshot(pair);
        vm.expectRevert(MorrowMarket.SaleNotBound.selector);
        market.recognizeCancellation(cancelled, firstIndex, first);
        require(snapshot(pair) == beforeState);
        market.recognizeCancellation(cancelled, secondIndex, second);
        require(market.consumed(key(cancelled.blockHeight, 0)) && market.consumed(key(cancelled.blockHeight, 1)));
        require(market.getSale(first).state == MarketTypes.State.CANCELLED_CLAIMABLE);
        require(market.getSale(second).state == MarketTypes.State.CANCELLED_CLAIMABLE);
        require(market.credits(BUYER) == 18121 && market.totalBound() == 0);
        withdrawCredit(BUYER);
        require(settlement.balanceOf(BUYER) == 1e23);
        require(settlement.balanceOf(address(market)) == 0 && market.totalLiabilities() == 0);
        require(market.credits(FEE) == 0 && market.credits(address(caller)) == 0);
    }
}
