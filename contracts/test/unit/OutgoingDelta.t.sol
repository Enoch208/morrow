// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MarketFixture} from "./MarketFixture.sol";
import {HostileToken} from "./HostileToken.sol";
import {MorrowMarket} from "../../src/destination/MorrowMarket.sol";
import {MarketTypes} from "../../src/destination/MarketTypes.sol";
import {FundedPaymentVault} from "../../src/source/FundedPaymentVault.sol";
import {SourceTypes} from "../../src/source/SourceTypes.sol";
import {SaleTermsLib} from "../../src/libraries/SaleTermsLib.sol";

contract OutgoingDeltaTest is MarketFixture {
    HostileToken private hostile;
    FundedPaymentVault private vault;
    uint256 private claimId;

    struct Snapshot {
        uint256[6] balances;
        uint256[2] allowances;
        uint256 supply;
        uint256[6] accounting;
        MarketTypes.Sale sale;
        bool[2] consumed;
        uint256 backing;
        uint256 nextClaimId;
        SourceTypes.Claim claim;
        SourceTypes.Round round;
    }

    function setUp() public override {
        super.setUp();
        hostile = new HostileToken();
        vm.chainId(11155111);
        vault = new FundedPaymentVault(address(hostile));
        hostile.approve(address(vault), 10000);
        claimId = vault.createClaim(address(hostile), 10000, SELLER, 3000, bytes32(0));
        require(vault.totalBacking() == 10000 && hostile.balanceOf(address(vault)) == 10000);
        vm.chainId(102031);
        market = new MorrowMarket(address(hostile), address(vault), address(hostile), FEE_RECIPIENT, 50);
        hostile.transfer(BUYER, 1000000);
        vm.prank(BUYER);
        hostile.approve(address(market), 9410);
        terms.sourceVault = address(vault);
        terms.sourceToken = address(hostile);
        terms.claimId = claimId;
        terms.destinationMarket = address(market);
        terms.settlementToken = address(hostile);
    }

    function test_T49_withdrawalRecipientTaxRollsBackEverythingThenPaysOnce() public {
        bytes32 id = fund();
        require(market.totalBound() == 9410 && hostile.balanceOf(address(market)) == 9410);
        market.settleAssignment(outcome(true), 0, id);
        require(market.credits(SELLER) == 9363 && market.credits(FEE_RECIPIENT) == 47);
        hostile.configure(true, false, address(0), hex"");
        Snapshot memory expected = snapshot();
        vm.prank(SELLER);
        vm.expectRevert(MorrowMarket.TransferDeltaMismatch.selector);
        market.withdraw();
        assertSnapshot(expected);
        hostile.configure(false, false, address(0), hex"");
        vm.prank(SELLER);
        market.withdraw();
        expected.balances[1] -= 9363;
        expected.balances[3] += 9363;
        expected.accounting[1] -= 9363;
        expected.accounting[2] -= 9363;
        expected.accounting[4] = 0;
        assertSnapshot(expected);
        vm.prank(SELLER);
        vm.expectRevert(MorrowMarket.NoCredit.selector);
        market.withdraw();
        assertSnapshot(expected);
        require(hostile.balanceOf(SELLER) == 9363 && market.totalLiabilities() == 47);
    }

    function test_T18_T19_redemptionRecipientTaxRollsBackEverythingThenPaysOnce() public {
        vm.chainId(11155111);
        vm.warp(3000);
        hostile.configure(true, false, address(0), hex"");
        Snapshot memory expected = snapshot();
        vm.expectRevert(FundedPaymentVault.TransferDeltaMismatch.selector);
        vault.redeem(claimId);
        assertSnapshot(expected);
        hostile.configure(false, false, address(0), hex"");
        vault.redeem(claimId);
        expected.balances[0] -= 10000;
        expected.balances[3] += 10000;
        expected.backing = 0;
        expected.claim.redeemed = true;
        assertSnapshot(expected);
        vm.expectRevert(FundedPaymentVault.NotRedeemable.selector);
        vault.redeem(claimId);
        assertSnapshot(expected);
        require(hostile.balanceOf(SELLER) == 10000 && vault.totalBacking() == 0);
    }

    function snapshot() private view returns (Snapshot memory state) {
        state.balances = [
            hostile.balanceOf(address(vault)),
            hostile.balanceOf(address(market)),
            hostile.balanceOf(BUYER),
            hostile.balanceOf(SELLER),
            hostile.balanceOf(FEE_RECIPIENT),
            hostile.balanceOf(address(this))
        ];
        state.allowances = [hostile.allowance(address(this), address(vault)), hostile.allowance(BUYER, address(market))];
        state.supply = hostile.totalSupply();
        state.accounting = [
            market.totalBound(),
            market.totalLiabilities(),
            market.totalCredits(),
            market.credits(BUYER),
            market.credits(SELLER),
            market.credits(FEE_RECIPIENT)
        ];
        state.sale = market.getSale(SaleTermsLib.saleId(terms));
        state.consumed = [
            market.consumed(keccak256(abi.encode(uint64(1), uint64(99), uint64(7), uint256(0)))),
            market.consumed(keccak256(abi.encode(uint64(1), uint64(100), uint64(7), uint256(0))))
        ];
        state.backing = vault.totalBacking();
        state.nextClaimId = vault.nextClaimId();
        state.claim = vault.getClaim(claimId);
        state.round = vault.getRound(claimId, 1);
    }

    function assertSnapshot(Snapshot memory expected) private view {
        require(keccak256(abi.encode(snapshot())) == keccak256(abi.encode(expected)));
        require(hostile.balanceOf(address(vault)) >= vault.totalBacking());
        require(hostile.balanceOf(address(market)) >= market.totalLiabilities());
        require(market.totalLiabilities() == market.totalBound() + market.totalCredits());
    }
}
