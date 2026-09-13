// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {FundedPaymentVault} from "../../src/source/FundedPaymentVault.sol";
import {MorrowTestToken} from "../../src/testnet/MorrowTestToken.sol";
import {SaleTermsLib} from "../../src/libraries/SaleTermsLib.sol";
import {SourceTypes} from "../../src/source/SourceTypes.sol";
import {SourceTerms} from "../../src/source/SourceTerms.sol";

interface VmSourceBoundaries {
    function chainId(uint256) external;
    function warp(uint256) external;
    function prank(address) external;
    function expectRevert(bytes4) external;
}

contract SourceBoundariesTest {
    VmSourceBoundaries private constant vm =
        VmSourceBoundaries(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant SELLER = address(0xA11CE);
    address private constant BUYER = address(0xB0B);
    address private constant STRANGER = address(0xBAD);
    MorrowTestToken private token;
    FundedPaymentVault private vault;
    uint256 private claimId;

    function setUp() public {
        vm.chainId(11155111);
        vm.warp(1000);
        token = new MorrowTestToken("Source boundary token", "SRC", 6, 100000000000);
        vault = new FundedPaymentVault(address(token));
        token.approve(address(vault), type(uint256).max);
        claimId = vault.createClaim(address(token), 10000000000, SELLER, 10000, bytes32(0));
    }

    function test_T01_invalidCreationPreservesFullSnapshotAndNextClaimId() public {
        bytes32 beforeState = snapshot();
        uint256 next = vault.nextClaimId();
        vm.expectRevert(FundedPaymentVault.InvalidClaim.selector);
        vault.createClaim(address(token), 100, SELLER, 999, bytes32(0));
        require(snapshot() == beforeState);
        vm.expectRevert(FundedPaymentVault.InvalidClaim.selector);
        vault.createClaim(address(token), 0, SELLER, 10000, bytes32(0));
        require(snapshot() == beforeState);
        vm.expectRevert(FundedPaymentVault.InvalidClaim.selector);
        vault.createClaim(address(token), 100, address(0), 10000, bytes32(0));
        require(snapshot() == beforeState && vault.nextClaimId() == next);
        vm.expectRevert(FundedPaymentVault.InvalidClaim.selector);
        vault.getClaim(next);
    }

    function test_T05_unauthorizedReservationPreservesFullSnapshot() public {
        SaleTermsLib.Terms memory supplied = terms(1);
        bytes32 beforeState = snapshot();
        vm.prank(STRANGER);
        vm.expectRevert(FundedPaymentVault.NotBeneficiary.selector);
        vault.reserveSale(claimId, supplied);
        require(snapshot() == beforeState);
    }

    function test_T08_assignmentCutoffBeyondMaturityPreservesFullSnapshot() public {
        SaleTermsLib.Terms memory supplied = terms(1);
        supplied.assignBefore = supplied.maturity + 1;
        bytes32 beforeState = snapshot();
        vm.prank(SELLER);
        vm.expectRevert(SourceTerms.InvalidSaleTerms.selector);
        vault.reserveSale(claimId, supplied);
        require(snapshot() == beforeState);
    }

    function test_T12_cancellationAtDeadlineMinusOnePreservesFullSnapshot() public {
        reserve(terms(1));
        vm.warp(8999);
        bytes32 beforeState = snapshot();
        vm.prank(STRANGER);
        vm.expectRevert(FundedPaymentVault.CancellationTooEarly.selector);
        vault.cancelExpiredSale(claimId, 1);
        require(snapshot() == beforeState);
        vm.warp(9000);
        vault.cancelExpiredSale(claimId, 1);
        require(vault.getRound(claimId, 1).state == SourceTypes.RoundState.CANCELLED);
    }

    function test_T16_staleAssignmentCannotChangeEitherRoundAfterRereservation() public {
        SaleTermsLib.Terms memory first = terms(1);
        reserve(first);
        vm.warp(9000);
        vault.cancelExpiredSale(claimId, 1);
        bytes32 oldRound = keccak256(abi.encode(vault.getRound(claimId, 1)));
        SaleTermsLib.Terms memory next = terms(2);
        next.fundBefore = 9400;
        next.assignBefore = 9500;
        reserve(next);
        require(keccak256(abi.encode(vault.getRound(claimId, 1))) == oldRound);
        require(vault.getRound(claimId, 1).termsHash != vault.getRound(claimId, 2).termsHash);
        bytes32 beforeState = snapshot();
        vm.prank(SELLER);
        vm.expectRevert(FundedPaymentVault.RoundMismatch.selector);
        vault.assignSale(claimId, 1, SaleTermsLib.termsHash(first));
        require(snapshot() == beforeState);
        vm.prank(SELLER);
        vm.expectRevert(FundedPaymentVault.RoundMismatch.selector);
        vault.assignSale(claimId, 1, SaleTermsLib.termsHash(next));
        require(snapshot() == beforeState);
        vm.prank(SELLER);
        vault.assignSale(claimId, 2, SaleTermsLib.termsHash(next));
        require(keccak256(abi.encode(vault.getRound(claimId, 1))) == oldRound);
        require(vault.getRound(claimId, 2).state == SourceTypes.RoundState.ASSIGNED);
        require(vault.getClaim(claimId).currentBeneficiary == BUYER);
    }

    function test_T14_cancellationAfterDeadlineCannotUndoAssignment() public {
        SaleTermsLib.Terms memory supplied = terms(1);
        reserve(supplied);
        vm.warp(8999);
        vm.prank(SELLER);
        vault.assignSale(claimId, 1, SaleTermsLib.termsHash(supplied));
        vm.warp(9001);
        bytes32 beforeState = snapshot();
        vm.prank(STRANGER);
        vm.expectRevert(FundedPaymentVault.RoundMismatch.selector);
        vault.cancelExpiredSale(claimId, 1);
        require(snapshot() == beforeState);
        require(vault.getRound(claimId, 1).state == SourceTypes.RoundState.ASSIGNED);
        require(vault.getClaim(claimId).currentBeneficiary == BUYER);
    }

    function snapshot() private view returns (bytes32) {
        bytes32 balances = keccak256(
            abi.encode(
                token.totalSupply(),
                token.balanceOf(address(vault)),
                token.balanceOf(address(this)),
                token.balanceOf(SELLER),
                token.balanceOf(BUYER),
                token.balanceOf(STRANGER),
                token.allowance(address(this), address(vault))
            )
        );
        return keccak256(
            abi.encode(
                balances,
                vault.nextClaimId(),
                vault.totalBacking(),
                vault.getClaim(claimId),
                vault.getRound(claimId, 1),
                vault.getRound(claimId, 2)
            )
        );
    }

    function reserve(SaleTermsLib.Terms memory supplied) private {
        vm.prank(SELLER);
        vault.reserveSale(claimId, supplied);
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
