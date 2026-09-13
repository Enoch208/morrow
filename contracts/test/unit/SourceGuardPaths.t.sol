// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {FundedPaymentVault} from "../../src/source/FundedPaymentVault.sol";
import {MorrowTestToken} from "../../src/testnet/MorrowTestToken.sol";
import {SaleTermsLib} from "../../src/libraries/SaleTermsLib.sol";
import {SourceTypes} from "../../src/source/SourceTypes.sol";

interface VmSourceGuards {
    function chainId(uint256) external;
    function warp(uint256) external;
    function prank(address) external;
    function expectRevert(bytes4) external;
}

contract SourceGuardPathsTest {
    VmSourceGuards private constant VM = VmSourceGuards(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant SELLER = address(0xA11CE);
    address private constant BUYER = address(0xB0B);
    MorrowTestToken private token;
    MorrowTestToken private other;
    FundedPaymentVault private vault;
    uint256 private claimId;

    function setUp() public {
        VM.chainId(11155111);
        VM.warp(1000);
        token = new MorrowTestToken("Source test token", "SRC", 6, 1000000);
        other = new MorrowTestToken("Unsupported test token", "OTHER", 6, 1000000);
        vault = new FundedPaymentVault(address(token));
        token.approve(address(vault), 30000);
        other.approve(address(vault), 30000);
        claimId = vault.createClaim(address(token), 10000, SELLER, 3000, keccak256("source-guard-fixture"));
    }

    function test_sourceConstructorRejectsWrongChainZeroAndCodelessToken() public {
        bytes32 beforeState = snapshot();
        VM.chainId(1);
        VM.expectRevert(FundedPaymentVault.UnsupportedToken.selector);
        new FundedPaymentVault(address(token));
        VM.chainId(11155111);
        VM.expectRevert(FundedPaymentVault.UnsupportedToken.selector);
        new FundedPaymentVault(address(0));
        require(BUYER.code.length == 0);
        VM.expectRevert(FundedPaymentVault.UnsupportedToken.selector);
        new FundedPaymentVault(BUYER);
        require(snapshot() == beforeState);
        FundedPaymentVault valid = new FundedPaymentVault(address(token));
        require(address(valid.SOURCE_TOKEN()) == address(token));
        require(valid.nextClaimId() == 1 && valid.totalBacking() == 0);
        require(snapshot() == beforeState);
    }

    function test_T01_wrongCreationTokenPreservesClaimsBalancesIdsAndAllowances() public {
        bytes32 beforeState = snapshot();
        VM.expectRevert(FundedPaymentVault.UnsupportedToken.selector);
        vault.createClaim(address(other), 10000, SELLER, 3000, keccak256("rejected-claim"));
        require(snapshot() == beforeState);
        VM.expectRevert(FundedPaymentVault.InvalidClaim.selector);
        vault.getClaim(2);
        require(vault.nextClaimId() == 2);
        require(token.allowance(address(this), address(vault)) == 20000);
        require(other.allowance(address(this), address(vault)) == 30000);
        uint256 next = vault.createClaim(address(token), 10000, SELLER, 3000, keccak256("valid-retry"));
        require(next == 2 && vault.nextClaimId() == 3);
        require(vault.totalBacking() == 20000 && token.balanceOf(address(vault)) == 20000);
        require(token.allowance(address(this), address(vault)) == 10000);
        require(other.allowance(address(this), address(vault)) == 30000);
        require(other.balanceOf(address(vault)) == 0 && other.balanceOf(address(this)) == 1000000);
    }

    function test_T31_wrongAssignmentHashPreservesActiveRoundThenAuthenticRetryWorks() public {
        SaleTermsLib.Terms memory terms = saleTerms();
        VM.prank(SELLER);
        vault.reserveSale(claimId, terms);
        VM.warp(1100);
        bytes32 beforeState = snapshot();
        bytes32 beforeMoney = moneySnapshot();
        bytes32 expectedHash = SaleTermsLib.termsHash(terms);
        VM.prank(SELLER);
        VM.expectRevert(FundedPaymentVault.TermsHashMismatch.selector);
        vault.assignSale(claimId, 1, expectedHash ^ bytes32(uint256(1)));
        require(snapshot() == beforeState);
        SourceTypes.Claim memory expectedClaim = vault.getClaim(claimId);
        SourceTypes.Round memory expectedRound = vault.getRound(claimId, 1);
        require(expectedClaim.activeRound == 1 && expectedRound.state == SourceTypes.RoundState.RESERVED);
        VM.prank(SELLER);
        vault.assignSale(claimId, 1, expectedHash);
        expectedClaim.currentBeneficiary = BUYER;
        expectedClaim.activeRound = 0;
        expectedClaim.successfulSale = true;
        expectedRound.state = SourceTypes.RoundState.ASSIGNED;
        require(keccak256(abi.encode(vault.getClaim(claimId))) == keccak256(abi.encode(expectedClaim)));
        require(keccak256(abi.encode(vault.getRound(claimId, 1))) == keccak256(abi.encode(expectedRound)));
        require(vault.nextClaimId() == 2 && moneySnapshot() == beforeMoney);
        require(vault.getRound(claimId, 2).state == SourceTypes.RoundState.ABSENT);
    }

    function snapshot() private view returns (bytes32) {
        return keccak256(
            abi.encode(
                vault.getClaim(claimId),
                vault.getRound(claimId, 0),
                vault.getRound(claimId, 1),
                vault.getRound(claimId, 2),
                vault.nextClaimId(),
                moneySnapshot()
            )
        );
    }

    function moneySnapshot() private view returns (bytes32) {
        return keccak256(abi.encode(vault.totalBacking(), tokenSnapshot(token), tokenSnapshot(other)));
    }

    function tokenSnapshot(MorrowTestToken asset) private view returns (bytes32) {
        return keccak256(
            abi.encode(
                asset.totalSupply(),
                asset.balanceOf(address(this)),
                asset.balanceOf(address(vault)),
                asset.balanceOf(SELLER),
                asset.balanceOf(BUYER),
                asset.allowance(address(this), address(vault)),
                asset.allowance(SELLER, address(vault)),
                asset.allowance(BUYER, address(vault))
            )
        );
    }

    function saleTerms() private view returns (SaleTermsLib.Terms memory) {
        return SaleTermsLib.Terms(
            1,
            11155111,
            address(vault),
            claimId,
            1,
            102031,
            address(0x1002),
            SELLER,
            BUYER,
            address(token),
            10000,
            3000,
            address(0x1006),
            9410,
            50,
            address(0xFEE),
            1800,
            2000
        );
    }
}
