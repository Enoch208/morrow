// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MarketFixture} from "./MarketFixture.sol";
import {MorrowMarket} from "../../src/destination/MorrowMarket.sol";
import {MorrowTestToken} from "../../src/testnet/MorrowTestToken.sol";
import {FundedPaymentVault} from "../../src/source/FundedPaymentVault.sol";
import {MarketTypes} from "../../src/destination/MarketTypes.sol";
import {SaleTermsLib} from "../../src/libraries/SaleTermsLib.sol";

contract FeeDecimalsTest is MarketFixture {
    function test_T51_feeBoundariesUseFloorAndConservePrincipal() public {
        vm.expectRevert(MorrowMarket.InvalidConfiguration.selector);
        new MorrowMarket(address(token), VAULT, SOURCE_TOKEN, FEE_RECIPIENT, 101);
        assertFee(1, 0);
        assertFee(1, 50);
        assertFee(1, 100);
        assertFee(9999, 50);
        assertFee(10000, 1);
        assertFee(10000, 50);
        assertFee(10001, 50);
        assertFee(9410, 0);
        assertFee(9410, 1);
        assertFee(9410, 50);
        assertFee(9410, 100);
    }

    function test_T52_sourceAndDestinationDecimalsStayIndependentRawUnits() public {
        vm.chainId(11155111);
        MorrowTestToken sourceToken = new MorrowTestToken("Source six", "S6", 6, 1e15);
        FundedPaymentVault vault = new FundedPaymentVault(address(sourceToken));
        sourceToken.approve(address(vault), type(uint256).max);
        uint256 face = 10000 * 1e6;
        uint256 id = vault.createClaim(address(sourceToken), face, SELLER, 10000, bytes32(0));
        vm.chainId(102031);
        MorrowTestToken settlement = new MorrowTestToken("Dest eighteen", "D18", 18, 1e24);
        uint256 price = 9410 * 1e18;
        MorrowMarket dest =
            new MorrowMarket(address(settlement), address(vault), address(sourceToken), FEE_RECIPIENT, 50);
        settlement.transfer(BUYER, price);
        vm.prank(BUYER);
        settlement.approve(address(dest), type(uint256).max);
        terms.sourceVault = address(vault);
        terms.sourceToken = address(sourceToken);
        terms.claimId = id;
        terms.destinationMarket = address(dest);
        terms.settlementToken = address(settlement);
        terms.sourceFaceValueRaw = face;
        terms.grossPurchasePriceRaw = price;
        market = dest;
        token = settlement;
        bytes32 sale = fund();
        require(face != price);
        require(sourceToken.decimals() == 6 && settlement.decimals() == 18);
        require(sourceToken.balanceOf(address(vault)) == face);
        require(settlement.balanceOf(address(dest)) == price);
        require(vault.totalBacking() == face && dest.totalBound() == price);
        dest.settleAssignment(outcome(true), 0, sale);
        uint256 fee = price * 50 / 10000;
        require(dest.credits(SELLER) == price - fee && dest.credits(FEE_RECIPIENT) == fee);
        require(dest.credits(BUYER) == 0);
        vm.warp(10000);
        vm.chainId(11155111);
        vault.redeem(id);
        require(sourceToken.balanceOf(SELLER) == face && vault.totalBacking() == 0);
        require(settlement.balanceOf(address(dest)) == price);
        require(dest.getSale(sale).state == MarketTypes.State.ASSIGNED_CLAIMABLE);
        solvent();
    }

    function assertFee(uint256 price, uint16 feeBps) private {
        market = new MorrowMarket(address(token), VAULT, SOURCE_TOKEN, FEE_RECIPIENT, feeBps);
        vm.prank(BUYER);
        token.approve(address(market), type(uint256).max);
        terms.destinationMarket = address(market);
        terms.grossPurchasePriceRaw = price;
        terms.feeBps = feeBps;
        bytes32 id = fund();
        market.settleAssignment(outcome(true), 0, id);
        uint256 fee = price * uint256(feeBps) / 10000;
        require(market.credits(FEE_RECIPIENT) == fee);
        require(market.credits(SELLER) == price - fee);
        require(market.credits(BUYER) == 0);
        require(market.totalBound() == 0 && market.totalCredits() == price);
        vm.prank(SELLER);
        market.withdraw();
        if (fee != 0) {
            vm.prank(FEE_RECIPIENT);
            market.withdraw();
            vm.prank(FEE_RECIPIENT);
            token.transfer(BUYER, fee);
        }
        vm.prank(SELLER);
        token.transfer(BUYER, price - fee);
        require(market.totalLiabilities() == 0);
        solvent();
        terms.claimId++;
        terms.round++;
    }
}
