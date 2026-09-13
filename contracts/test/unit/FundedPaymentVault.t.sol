// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {FundedPaymentVault} from "../../src/source/FundedPaymentVault.sol";
import {MorrowTestToken} from "../../src/testnet/MorrowTestToken.sol";
import {SaleTermsLib} from "../../src/libraries/SaleTermsLib.sol";
import {SourceTypes} from "../../src/source/SourceTypes.sol";
import {SourceTerms} from "../../src/source/SourceTerms.sol";

interface VmSource {
    function chainId(uint256) external;
    function warp(uint256) external;
    function prank(address) external;
    function expectRevert(bytes4) external;
}

contract FundedPaymentVaultTest {
    VmSource private constant VM = VmSource(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant SELLER = address(0xA11CE);
    address private constant BUYER = address(0xB0B);
    MorrowTestToken private token;
    FundedPaymentVault private vault;
    uint256 private claimId;

    function setUp() public {
        VM.chainId(11155111);
        VM.warp(1000);
        token = new MorrowTestToken("Source test token", "SRC", 6, 100000000000);
        vault = new FundedPaymentVault(address(token));
        token.approve(address(vault), type(uint256).max);
        claimId = vault.createClaim(address(token), 10000000000, SELLER, 10000, bytes32(0));
    }

    function test_T01_invalidCreationDoesNotMoveBacking() public {
        VM.expectRevert(FundedPaymentVault.InvalidClaim.selector);
        vault.createClaim(address(token), 0, SELLER, 10000, bytes32(0));
        VM.expectRevert(FundedPaymentVault.InvalidClaim.selector);
        vault.createClaim(address(token), 100, address(0), 10000, bytes32(0));
        VM.expectRevert(FundedPaymentVault.InvalidClaim.selector);
        vault.createClaim(address(token), 100, SELLER, 1000, bytes32(0));
        require(vault.totalBacking() == 10000000000);
        require(token.balanceOf(address(vault)) == 10000000000);
    }

    function test_T05_nonOwnerReservationRejected() public {
        VM.expectRevert(FundedPaymentVault.NotBeneficiary.selector);
        vault.reserveSale(claimId, terms(1));
    }

    function test_T09_assignmentBeforeDeadlineAndT55ManualBypass() public {
        reserve(1);
        VM.warp(8999);
        VM.prank(SELLER);
        vault.assignSale(claimId, 1, SaleTermsLib.termsHash(terms(1)));
        require(vault.getClaim(claimId).currentBeneficiary == BUYER);
        require(vault.getRound(claimId, 1).state == SourceTypes.RoundState.ASSIGNED);
        VM.expectRevert(FundedPaymentVault.RoundMismatch.selector);
        vault.cancelExpiredSale(claimId, 1);
    }

    function test_T10_T11_assignmentAndCancellationBoundary() public {
        reserve(1);
        VM.warp(9000);
        VM.prank(SELLER);
        VM.expectRevert(FundedPaymentVault.AssignmentExpired.selector);
        vault.assignSale(claimId, 1, SaleTermsLib.termsHash(terms(1)));
        vault.cancelExpiredSale(claimId, 1);
        require(vault.getRound(claimId, 1).state == SourceTypes.RoundState.CANCELLED);
        require(vault.getClaim(claimId).currentBeneficiary == SELLER);
    }

    function test_T12_earlyCancellationRejected() public {
        reserve(1);
        VM.expectRevert(FundedPaymentVault.CancellationTooEarly.selector);
        vault.cancelExpiredSale(claimId, 1);
    }

    function test_T15_T16_oldRoundCannotAffectNewReservation() public {
        reserve(1);
        VM.warp(9000);
        vault.cancelExpiredSale(claimId, 1);
        SaleTermsLib.Terms memory next = terms(2);
        next.assignBefore = 9500;
        next.fundBefore = 9400;
        VM.prank(SELLER);
        vault.reserveSale(claimId, next);
        VM.expectRevert(FundedPaymentVault.RoundMismatch.selector);
        vault.cancelExpiredSale(claimId, 1);
        require(vault.getRound(claimId, 1).state == SourceTypes.RoundState.CANCELLED);
        require(vault.getRound(claimId, 2).state == SourceTypes.RoundState.RESERVED);
        require(vault.getRound(claimId, 1).saleId != vault.getRound(claimId, 2).saleId);
    }

    function test_T18_T19_redemptionPaysOnlyBeneficiaryOnce() public {
        VM.expectRevert(FundedPaymentVault.NotRedeemable.selector);
        vault.redeem(claimId);
        VM.warp(10000);
        vault.redeem(claimId);
        require(token.balanceOf(SELLER) == 10000000000);
        require(vault.totalBacking() == 0);
        VM.expectRevert(FundedPaymentVault.NotRedeemable.selector);
        vault.redeem(claimId);
    }

    function test_T03_donationCannotCreateRedemptionRights() public {
        token.transfer(address(vault), 77);
        VM.warp(10000);
        vault.redeem(claimId);
        require(token.balanceOf(address(vault)) == 77);
        require(vault.totalBacking() == 0);
    }

    function test_T06_reservedSoldRedeemedClaimsCannotReserve() public {
        reserve(1);
        VM.prank(SELLER);
        VM.expectRevert(FundedPaymentVault.NotReservable.selector);
        vault.reserveSale(claimId, terms(2));
        VM.prank(SELLER);
        vault.assignSale(claimId, 1, SaleTermsLib.termsHash(terms(1)));
        VM.prank(BUYER);
        VM.expectRevert(FundedPaymentVault.NotReservable.selector);
        vault.reserveSale(claimId, terms(2));
        VM.warp(10000);
        vault.redeem(claimId);
        VM.prank(BUYER);
        VM.expectRevert(FundedPaymentVault.NotReservable.selector);
        vault.reserveSale(claimId, terms(2));
    }

    function test_T07_sourceOwnedFieldsCannotBeSubstituted() public {
        SaleTermsLib.Terms memory supplied = terms(1);
        supplied.sourceFaceValueRaw++;
        VM.prank(SELLER);
        VM.expectRevert(SourceTerms.TermsMismatch.selector);
        vault.reserveSale(claimId, supplied);
        supplied = terms(1);
        supplied.sourceToken = address(0xBAD);
        VM.prank(SELLER);
        VM.expectRevert(SourceTerms.TermsMismatch.selector);
        vault.reserveSale(claimId, supplied);
        supplied = terms(1);
        supplied.maturity++;
        VM.prank(SELLER);
        VM.expectRevert(SourceTerms.TermsMismatch.selector);
        vault.reserveSale(claimId, supplied);
        require(vault.getClaim(claimId).activeRound == 0);
    }

    function test_T08_cutoffMustPrecedeMaturity() public {
        SaleTermsLib.Terms memory supplied = terms(1);
        supplied.assignBefore = supplied.maturity;
        VM.prank(SELLER);
        VM.expectRevert(SourceTerms.InvalidSaleTerms.selector);
        vault.reserveSale(claimId, supplied);
    }

    function test_T13_assignmentAfterCancellationRejected() public {
        reserve(1);
        VM.warp(9000);
        vault.cancelExpiredSale(claimId, 1);
        VM.prank(SELLER);
        VM.expectRevert(FundedPaymentVault.RoundMismatch.selector);
        vault.assignSale(claimId, 1, SaleTermsLib.termsHash(terms(1)));
    }

    function reserve(uint256 round) private {
        VM.prank(SELLER);
        vault.reserveSale(claimId, terms(round));
    }

    function terms(uint256 round) private view returns (SaleTermsLib.Terms memory) {
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
            10000000000,
            10000,
            address(0x1006),
            9410000000,
            50,
            address(0xFEE),
            8000,
            9000
        );
    }
}
