// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {StreamPaymentVault} from "../../src/source/StreamPaymentVault.sol";
import {MorrowTestToken} from "../../src/testnet/MorrowTestToken.sol";
import {SaleTermsLib} from "../../src/libraries/SaleTermsLib.sol";
import {SourceTypes} from "../../src/source/SourceTypes.sol";
import {MockStreamLockup} from "./MockStreamLockup.sol";
import {FundedPaymentVault as FundedPaymentVaultEvents} from "../../src/source/FundedPaymentVault.sol";

interface VmStream {
    function chainId(uint256) external;
    function warp(uint256) external;
    function prank(address) external;
    function deal(address, uint256) external;
    function expectRevert(bytes4) external;
}

contract StreamPaymentVaultTest {
    VmStream private constant VM = VmStream(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant SELLER = address(0xA11CE);
    address private constant BUYER = address(0xB0B);
    address private constant STRANGER = address(0x5757);
    uint128 private constant DEPOSIT = 10_000e6;
    MorrowTestToken private token;
    MorrowTestToken private otherToken;
    MockStreamLockup private lockup;
    StreamPaymentVault private vault;

    function setUp() public {
        VM.chainId(11155111);
        VM.warp(1000);
        token = new MorrowTestToken("Source test token", "SRC", 6, 1_000_000e6);
        otherToken = new MorrowTestToken("Other token", "OTH", 6, 1_000_000e6);
        lockup = new MockStreamLockup();
        vault = new StreamPaymentVault(address(token), address(lockup));
        token.approve(address(lockup), type(uint256).max);
        otherToken.approve(address(lockup), type(uint256).max);
    }

    function stream(uint8 model, bool cancelable, bool transferable) private returns (uint256) {
        return lockup.create(SELLER, address(token), DEPOSIT, 1000, 11000, model, cancelable, transferable);
    }

    function wrap(uint256 streamId) private returns (uint256 claimId) {
        VM.prank(SELLER);
        lockup.approve(address(vault), streamId);
        VM.prank(SELLER);
        claimId = vault.wrapStream(streamId, bytes32(0));
    }

    function test_wrapHoldsTheNftAndRecordsExactRemainingEntitlement() public {
        uint256 streamId = stream(0, false, true);
        VM.warp(3500);
        VM.prank(SELLER);
        lockup.withdraw(streamId, SELLER, 1_000e6);
        uint256 claimId = wrap(streamId);
        SourceTypes.Claim memory claim = vault.getClaim(claimId);
        require(lockup.ownerOf(streamId) == address(vault));
        require(claim.sourceFaceValueRaw == DEPOSIT - 1_000e6);
        require(claim.maturity == 11000);
        require(claim.currentBeneficiary == SELLER);
        require(vault.withdrawnAtWrap(claimId) == 1_000e6);
        require(vault.totalBacking() == DEPOSIT - 1_000e6);
    }

    function test_unsafeStreamsAreRejected() public {
        uint256 cancelable = stream(0, true, true);
        VM.prank(SELLER);
        lockup.approve(address(vault), cancelable);
        VM.prank(SELLER);
        VM.expectRevert(StreamPaymentVault.UnsupportedStream.selector);
        vault.wrapStream(cancelable, bytes32(0));

        uint256 priceGated = stream(3, false, true);
        VM.prank(SELLER);
        VM.expectRevert(StreamPaymentVault.UnsupportedStream.selector);
        vault.wrapStream(priceGated, bytes32(0));

        uint256 locked = stream(0, false, false);
        VM.prank(SELLER);
        VM.expectRevert(StreamPaymentVault.UnsupportedStream.selector);
        vault.wrapStream(locked, bytes32(0));

        uint256 wrongToken = lockup.create(SELLER, address(otherToken), DEPOSIT, 1000, 11000, 0, false, true);
        VM.prank(SELLER);
        VM.expectRevert(StreamPaymentVault.UnsupportedToken.selector);
        vault.wrapStream(wrongToken, bytes32(0));

        uint256 ended = stream(0, false, true);
        VM.warp(11000);
        VM.prank(SELLER);
        VM.expectRevert(StreamPaymentVault.UnsupportedStream.selector);
        vault.wrapStream(ended, bytes32(0));
        require(vault.nextClaimId() == 1);
    }

    function test_canceledStreamIsRejected() public {
        uint256 streamId = stream(0, true, true);
        VM.warp(2000);
        lockup.cancel(streamId);
        VM.prank(SELLER);
        VM.expectRevert(StreamPaymentVault.UnsupportedStream.selector);
        vault.wrapStream(streamId, bytes32(0));
    }

    function test_renouncedStreamBecomesWrappable() public {
        uint256 streamId = stream(0, true, true);
        lockup.renounce(streamId);
        uint256 claimId = wrap(streamId);
        require(vault.getClaim(claimId).sourceFaceValueRaw == DEPOSIT);
    }

    function test_fullyWithdrawnEndedStreamIsRejected() public {
        uint256 streamId = stream(0, false, true);
        VM.warp(10999);
        VM.prank(SELLER);
        lockup.withdrawMax(streamId, SELLER);
        VM.warp(11000);
        VM.prank(SELLER);
        lockup.withdrawMax(streamId, SELLER);
        VM.prank(SELLER);
        VM.expectRevert(StreamPaymentVault.UnsupportedStream.selector);
        vault.wrapStream(streamId, bytes32(0));
    }

    function test_twoStreamsOnTheSameTokenKeepSeparateBacking() public {
        uint256 first = wrap(stream(0, false, true));
        uint256 secondStream = lockup.create(SELLER, address(token), DEPOSIT / 2, 1000, 21000, 0, false, true);
        uint256 second = wrap(secondStream);
        VM.warp(11000);
        vault.redeem(first);
        require(token.balanceOf(SELLER) == DEPOSIT);
        require(token.balanceOf(address(vault)) == 0);
        VM.warp(15000);
        VM.prank(STRANGER);
        lockup.withdrawMax(secondStream, address(vault));
        VM.expectRevert(StreamPaymentVault.NotRedeemable.selector);
        vault.redeem(second);
        VM.warp(21000);
        vault.redeem(second);
        require(token.balanceOf(SELLER) == DEPOSIT + DEPOSIT / 2);
        require(token.balanceOf(address(vault)) == 0);
        require(vault.totalBacking() == 0);
    }

    function test_onlyTheCurrentOwnerCanWrap() public {
        uint256 streamId = stream(0, false, true);
        VM.prank(STRANGER);
        VM.expectRevert(StreamPaymentVault.NotStreamOwner.selector);
        vault.wrapStream(streamId, bytes32(0));
    }

    function test_thirdPartyWithdrawalsBeforeMaturityCannotChangeRedemption() public {
        uint256 streamId = stream(0, false, true);
        uint256 claimId = wrap(streamId);
        VM.warp(6000);
        VM.prank(STRANGER);
        lockup.withdrawMax(streamId, address(vault));
        VM.prank(STRANGER);
        VM.expectRevert(MockStreamLockup.NotAllowed.selector);
        lockup.withdraw(streamId, STRANGER, 1);
        reserveAndAssign(claimId);
        VM.warp(11000);
        vault.redeem(claimId);
        require(token.balanceOf(BUYER) == DEPOSIT);
        require(token.balanceOf(address(vault)) == 0);
        require(vault.totalBacking() == 0);
        VM.expectRevert(StreamPaymentVault.NotRedeemable.selector);
        vault.redeem(claimId);
    }

    function test_redemptionForwardsAndRequiresTheLockupFee() public {
        uint256 claimId = wrap(stream(0, false, true));
        lockup.setMinFee(0.001 ether);
        VM.warp(11000);
        VM.expectRevert(MockStreamLockup.InsufficientFee.selector);
        vault.redeem(claimId);
        VM.deal(address(this), 1 ether);
        vault.redeem{value: 0.001 ether}(claimId);
        require(token.balanceOf(SELLER) == DEPOSIT);
        require(address(lockup).balance == 0.001 ether);
    }

    function test_feeSentForADepletedStreamIsReturnedAndRedemptionStillPays() public {
        uint256 streamId = stream(0, false, true);
        uint256 claimId = wrap(streamId);
        lockup.setMinFee(0.001 ether);
        VM.warp(11000);
        VM.deal(STRANGER, 1 ether);
        VM.prank(STRANGER);
        lockup.withdrawMax{value: 0.001 ether}(streamId, address(vault));
        VM.deal(address(this), 1 ether);
        uint256 before = address(this).balance;
        vault.redeem{value: 0.001 ether}(claimId);
        require(address(this).balance == before);
        require(address(vault).balance == 0);
        require(token.balanceOf(SELLER) == DEPOSIT);
    }

    function test_feeRefundFailureRevertsWithoutPaying() public {
        uint256 streamId = stream(0, false, true);
        uint256 claimId = wrap(streamId);
        VM.warp(11000);
        lockup.withdrawMax(streamId, address(vault));
        NoEtherCaller caller = new NoEtherCaller();
        VM.deal(address(caller), 1 ether);
        VM.expectRevert(StreamPaymentVault.FeeRefundFailed.selector);
        caller.redeem(vault, claimId);
        require(!vault.getClaim(claimId).redeemed);
    }

    function test_vaultCannotBeTheBuyer() public {
        uint256 claimId = wrap(stream(0, false, true));
        SaleTermsLib.Terms memory reserved = terms(claimId, 1);
        reserved.buyer = address(vault);
        VM.prank(SELLER);
        VM.expectRevert(StreamPaymentVault.InvalidBuyer.selector);
        vault.reserveSale(claimId, reserved);
    }

    function test_donationsNeverCreateRedemptionRights() public {
        uint256 claimId = wrap(stream(0, false, true));
        token.transfer(address(vault), 77);
        VM.warp(11000);
        vault.redeem(claimId);
        require(token.balanceOf(SELLER) == DEPOSIT);
        require(token.balanceOf(address(vault)) == 77);
    }

    function test_reservedClaimMustBeCancelledBeforeRedemption() public {
        uint256 claimId = wrap(stream(0, false, true));
        SaleTermsLib.Terms memory reserved = terms(claimId, 1);
        VM.prank(SELLER);
        vault.reserveSale(claimId, reserved);
        VM.warp(11000);
        VM.expectRevert(StreamPaymentVault.NotRedeemable.selector);
        vault.redeem(claimId);
        vault.cancelExpiredSale(claimId, 1);
        vault.redeem(claimId);
        require(token.balanceOf(SELLER) == DEPOSIT);
    }

    function testFuzz_entitlementIsConservedAcrossPartialWithdrawals(uint16 before, uint16 during) public {
        uint256 streamId = stream(0, false, true);
        uint256 earlyAt = 1000 + (uint256(before) % 9000);
        VM.warp(earlyAt);
        uint128 available = lockup.streamedAmountOf(streamId);
        uint128 early = available == 0 ? 0 : uint128(uint256(before) % available) + 1;
        if (early > 0) {
            VM.prank(SELLER);
            lockup.withdraw(streamId, SELLER, early);
        }
        uint256 claimId = wrap(streamId);
        VM.warp(earlyAt + 1 + (uint256(during) % (11000 - earlyAt)));
        uint128 midway = lockup.streamedAmountOf(streamId) - lockup.getWithdrawnAmount(streamId);
        if (midway > 0) lockup.withdraw(streamId, address(vault), midway);
        VM.warp(11000);
        vault.redeem(claimId);
        require(token.balanceOf(SELLER) == DEPOSIT);
        require(token.balanceOf(address(vault)) == 0);
    }

    function reserveAndAssign(uint256 claimId) private {
        SaleTermsLib.Terms memory reserved = terms(claimId, 1);
        VM.prank(SELLER);
        vault.reserveSale(claimId, reserved);
        VM.prank(SELLER);
        vault.assignSale(claimId, 1, SaleTermsLib.termsHash(reserved));
        require(vault.getClaim(claimId).currentBeneficiary == BUYER);
    }

    function terms(uint256 claimId, uint256 round) private view returns (SaleTermsLib.Terms memory) {
        SourceTypes.Claim memory claim = vault.getClaim(claimId);
        return SaleTermsLib.Terms(
            1,
            11155111,
            address(vault),
            claimId,
            round,
            102031,
            address(0x1002),
            SELLER,
            BUYER,
            address(token),
            claim.sourceFaceValueRaw,
            claim.maturity,
            address(0x1006),
            9410e6,
            50,
            address(0xFEE),
            block.timestamp + 600,
            block.timestamp + 900
        );
    }

    receive() external payable {}
}

contract NoEtherCaller {
    function redeem(StreamPaymentVault vault, uint256 claimId) external {
        vault.redeem{value: 1}(claimId);
    }
}

contract StreamVaultEventCompatibilityTest {
    function test_saleEventsMatchTheMarketBoundSourceEvents() public pure {
        require(
            StreamPaymentVault.SaleReserved.selector == FundedPaymentVaultEvents.SaleReserved.selector
                && StreamPaymentVault.SaleAssigned.selector == FundedPaymentVaultEvents.SaleAssigned.selector
                && StreamPaymentVault.SaleCancelled.selector == FundedPaymentVaultEvents.SaleCancelled.selector
                && StreamPaymentVault.ClaimFunded.selector == FundedPaymentVaultEvents.ClaimFunded.selector
                && StreamPaymentVault.ClaimRedeemed.selector == FundedPaymentVaultEvents.ClaimRedeemed.selector
        );
    }
}
