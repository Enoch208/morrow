// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {PayoutRegistrar, IFundedPaymentVault} from "../src/PayoutRegistrar.sol";
import {FundedPaymentVault} from "@morrow/contracts/source/FundedPaymentVault.sol";
import {MorrowTestToken} from "@morrow/contracts/testnet/MorrowTestToken.sol";
import {SaleTermsLib} from "@morrow/contracts/libraries/SaleTermsLib.sol";

interface VmRegistrar {
    function chainId(uint256) external;
    function warp(uint256) external;
    function prank(address) external;
    function expectRevert() external;
    function expectRevert(bytes4) external;
}

contract PayoutRegistrarTest {
    VmRegistrar private constant VM = VmRegistrar(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant RECIPIENT = address(0xA11CE);
    MorrowTestToken private token;
    FundedPaymentVault private vault;
    PayoutRegistrar private registrar;

    function setUp() public {
        VM.chainId(11155111);
        VM.warp(1000);
        token = new MorrowTestToken("Local source test token", "SRC", 6, type(uint128).max);
        vault = new FundedPaymentVault(address(token));
        registrar = new PayoutRegistrar(IFundedPaymentVault(address(vault)));
        token.approve(address(registrar), type(uint256).max);
    }

    function testFuzz_registrationLocksExactPrincipal(uint96 amount) public {
        uint256 principal = uint256(amount) + 1;
        uint256 id = registrar.register(principal, RECIPIENT, 2000, bytes32(0));
        require(vault.getClaim(id).currentBeneficiary == RECIPIENT);
        require(vault.getClaim(id).sourceFaceValueRaw == principal);
        require(vault.totalBacking() == principal);
        require(token.balanceOf(address(vault)) == principal);
        require(token.balanceOf(address(registrar)) == 0);
        require(token.allowance(address(registrar), address(vault)) == 0);
    }

    function test_invalidPayoutRollsBackBothTransfers() public {
        uint256 beforeBalance = token.balanceOf(address(this));
        VM.expectRevert(FundedPaymentVault.InvalidClaim.selector);
        registrar.register(100, RECIPIENT, 1000, bytes32(0));
        require(token.balanceOf(address(this)) == beforeBalance);
        require(vault.totalBacking() == 0);
        require(vault.nextClaimId() == 1);
        require(token.balanceOf(address(registrar)) == 0);
    }

    function test_unfundedCallerCannotRegister() public {
        VM.prank(address(0xBAD));
        VM.expectRevert();
        registrar.register(100, RECIPIENT, 2000, bytes32(0));
        require(vault.nextClaimId() == 1);
    }

    function test_registrationDoesNotGivePayerDispositionRights() public {
        uint256 id = registrar.register(100, RECIPIENT, 2000, bytes32(0));
        SaleTermsLib.Terms memory empty;
        VM.expectRevert(FundedPaymentVault.NotBeneficiary.selector);
        vault.reserveSale(id, empty);
        VM.prank(address(registrar));
        VM.expectRevert(FundedPaymentVault.NotBeneficiary.selector);
        vault.reserveSale(id, empty);
        VM.warp(2000);
        vault.redeem(id);
        require(token.balanceOf(RECIPIENT) == 100);
        require(vault.totalBacking() == 0);
    }
}
