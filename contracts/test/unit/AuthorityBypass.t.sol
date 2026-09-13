// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {FundedPaymentVault} from "../../src/source/FundedPaymentVault.sol";
import {MorrowTestToken} from "../../src/testnet/MorrowTestToken.sol";
import {SaleTermsLib} from "../../src/libraries/SaleTermsLib.sol";

interface VmBypass {
    function chainId(uint256) external;
    function warp(uint256) external;
    function prank(address) external;
    function expectRevert(bytes4) external;
}

contract AuthorityBypassTest {
    VmBypass private constant VM = VmBypass(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant SELLER = address(0xA11CE);
    address private constant BUYER = address(0xB0B);
    address private constant STRANGER = address(0xBAD);
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

    function test_T04_principalSweepAndAdminWithdrawalHaveNoPath() public {
        uint256 backing = token.balanceOf(address(vault));
        require(!attempt("withdraw()"));
        require(!attempt("withdraw(address,uint256)", abi.encode(address(token), backing)));
        require(!attempt("sweep(address)", abi.encode(address(token))));
        require(!attempt("rescueTokens(address,uint256)", abi.encode(address(token), backing)));
        require(!attempt("emergencyWithdraw(address)", abi.encode(address(token))));
        require(!attempt("transferOwnership(address)", abi.encode(STRANGER)));
        require(token.balanceOf(address(vault)) == backing);
        require(vault.totalBacking() == backing);
        require(vault.getClaim(claimId).currentBeneficiary == SELLER);
    }

    function test_T17_arbitraryBeneficiaryTransferHasNoPath() public {
        require(!attempt("setBeneficiary(uint256,address)", abi.encode(claimId, STRANGER)));
        require(!attempt("transferFrom(address,address,uint256)", abi.encode(SELLER, STRANGER, claimId)));
        require(!attempt("safeTransferFrom(address,address,uint256)", abi.encode(SELLER, STRANGER, claimId)));
        require(!attempt("transfer(address,uint256)", abi.encode(STRANGER, claimId)));
        VM.prank(STRANGER);
        VM.expectRevert(FundedPaymentVault.NotBeneficiary.selector);
        vault.reserveSale(claimId, terms());
        VM.prank(SELLER);
        vault.reserveSale(claimId, terms());
        VM.prank(STRANGER);
        VM.expectRevert(FundedPaymentVault.NotBeneficiary.selector);
        vault.assignSale(claimId, 1, SaleTermsLib.termsHash(terms()));
        require(vault.getClaim(claimId).currentBeneficiary == SELLER);
        require(token.balanceOf(address(vault)) == 10000000000);
        require(vault.totalBacking() == 10000000000);
    }

    function attempt(string memory signature) private returns (bool ok) {
        (ok,) = address(vault).call(abi.encodeWithSignature(signature));
    }

    function attempt(string memory signature, bytes memory args) private returns (bool ok) {
        (ok,) = address(vault).call(bytes.concat(bytes4(keccak256(bytes(signature))), args));
    }

    function terms() private view returns (SaleTermsLib.Terms memory) {
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
