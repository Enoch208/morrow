// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MarketFixture} from "./MarketFixture.sol";
import {HostileToken} from "./HostileToken.sol";
import {MorrowMarket} from "../../src/destination/MorrowMarket.sol";
import {MarketTypes} from "../../src/destination/MarketTypes.sol";
import {FundedPaymentVault} from "../../src/source/FundedPaymentVault.sol";
import {SaleTermsLib} from "../../src/libraries/SaleTermsLib.sol";

contract TokenSafetyTest is MarketFixture {
    HostileToken private hostile;

    function setUp() public override {
        super.setUp();
        hostile = new HostileToken();
        market = new MorrowMarket(address(hostile), VAULT, SOURCE_TOKEN, FEE_RECIPIENT, 50);
        hostile.transfer(BUYER, 1000000);
        vm.prank(BUYER);
        hostile.approve(address(market), type(uint256).max);
        terms.destinationMarket = address(market);
        terms.settlementToken = address(hostile);
    }

    function test_T34_taxedFundingRollsBackMoneyStateAndConsumption() public {
        hostile.configure(true, false, address(0), hex"");
        vm.prank(BUYER);
        vm.expectRevert(MorrowMarket.TransferDeltaMismatch.selector);
        market.fundReservation(reservation(terms), 0, terms);
        require(market.getSale(SaleTermsLib.saleId(terms)).state == MarketTypes.State.ABSENT);
        require(market.totalLiabilities() == 0 && hostile.balanceOf(BUYER) == 1000000);
        hostile.configure(false, false, address(0), hex"");
        fund();
        require(market.totalBound() == 9410);
    }

    function test_T49_failedWithdrawalRetainsCredit() public {
        bytes32 id = fund();
        market.settleAssignment(outcome(true), 0, id);
        hostile.configure(false, true, address(0), hex"");
        vm.prank(SELLER);
        vm.expectRevert(HostileToken.RejectedTransfer.selector);
        market.withdraw();
        require(market.credits(SELLER) == 9363 && market.totalLiabilities() == 9410);
        hostile.configure(false, false, address(0), hex"");
        vm.prank(SELLER);
        market.withdraw();
        require(hostile.balanceOf(SELLER) == 9363 && market.totalLiabilities() == 47);
    }

    function test_T48_fundingCallbackCannotReenter() public {
        bytes memory data = abi.encodeCall(MorrowMarket.fundReservation, (reservation(terms), 0, terms));
        hostile.configure(false, false, address(market), data);
        fund();
        require(!hostile.callbackSucceeded());
        require(market.totalLiabilities() == 9410 && hostile.balanceOf(address(market)) == 9410);
    }

    function test_T48_creditedTokenCallbackCannotWithdrawTwice() public {
        terms.seller = address(hostile);
        bytes32 id = fund();
        market.settleAssignment(outcome(true), 0, id);
        hostile.configure(false, false, address(market), abi.encodeCall(MorrowMarket.withdraw, ()));
        vm.prank(address(hostile));
        market.withdraw();
        require(!hostile.callbackSucceeded());
        require(market.credits(address(hostile)) == 0 && hostile.balanceOf(address(hostile)) == 9363);
        require(market.totalLiabilities() == 47);
    }

    function test_T02_sourceTaxCannotCreateUnbackedClaim() public {
        vm.chainId(11155111);
        FundedPaymentVault vault = new FundedPaymentVault(address(hostile));
        hostile.approve(address(vault), type(uint256).max);
        hostile.configure(true, false, address(0), hex"");
        vm.expectRevert(FundedPaymentVault.TransferDeltaMismatch.selector);
        vault.createClaim(address(hostile), 10000, SELLER, 3000, bytes32(0));
        require(vault.nextClaimId() == 1 && vault.totalBacking() == 0);
        require(hostile.balanceOf(address(vault)) == 0);
    }

    function test_T48_sourceCreationCallbackCannotCreateSecondClaim() public {
        vm.chainId(11155111);
        FundedPaymentVault vault = new FundedPaymentVault(address(hostile));
        hostile.approve(address(vault), type(uint256).max);
        hostile.configure(
            false,
            false,
            address(vault),
            abi.encodeCall(FundedPaymentVault.createClaim, (address(hostile), 10000, SELLER, 4000, bytes32(0)))
        );
        uint256 id = vault.createClaim(address(hostile), 10000, SELLER, 3000, bytes32(0));
        require(!hostile.callbackSucceeded());
        require(id == 1 && vault.nextClaimId() == 2 && vault.totalBacking() == 10000);
        require(hostile.balanceOf(address(vault)) == 10000 && hostile.balanceOf(address(this)) == 998990000);
    }

    function test_T48_sourceRedemptionCallbackCannotRedeemTwice() public {
        vm.chainId(11155111);
        FundedPaymentVault vault = new FundedPaymentVault(address(hostile));
        hostile.approve(address(vault), type(uint256).max);
        uint256 id = vault.createClaim(address(hostile), 10000, SELLER, 3000, bytes32(0));
        hostile.configure(false, false, address(vault), abi.encodeCall(FundedPaymentVault.redeem, (id)));
        vm.warp(3000);
        vault.redeem(id);
        require(!hostile.callbackSucceeded() && vault.getClaim(id).redeemed);
        require(vault.totalBacking() == 0 && hostile.balanceOf(SELLER) == 10000);
    }
}
