// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {StreamPaymentVault} from "../src/source/StreamPaymentVault.sol";
import {SaleTermsLib} from "../src/libraries/SaleTermsLib.sol";
import {SourceTypes} from "../src/source/SourceTypes.sol";

interface VmFork {
    function chainId(uint256) external;
    function warp(uint256) external;
    function prank(address) external;
    function expectRevert(bytes4) external;
}

struct CreateWithDurations {
    address sender;
    address recipient;
    uint128 depositAmount;
    IERC20 token;
    bool cancelable;
    bool transferable;
    string shape;
}

struct UnlockAmounts {
    uint128 start;
    uint128 cliff;
}

struct Durations {
    uint40 cliff;
    uint40 total;
}

interface ISablierLockupV4 {
    function createWithDurationsLL(
        CreateWithDurations calldata params,
        UnlockAmounts calldata unlockAmounts,
        uint40 granularity,
        Durations calldata durations
    ) external payable returns (uint256 streamId);
    function approve(address to, uint256 streamId) external;
    function ownerOf(uint256 streamId) external view returns (address);
    function withdrawMax(uint256 streamId, address to) external payable returns (uint128);
}

contract StreamPaymentVaultSepoliaForkTest {
    VmFork private constant VM = VmFork(address(uint160(uint256(keccak256("hevm cheat code")))));
    ISablierLockupV4 private constant LOCKUP = ISablierLockupV4(0xe61cb9153356419bdaD0A8767c059f92d221a3C4);
    IERC20 private constant SOURCE_TOKEN = IERC20(0x77B3e1AE0cad279b8Ad1e7b01a89efd139E1e5E9);
    address private constant PAYER = 0x9DDB9007583a7b9DF073B65bCE820f77D6E2365D;
    address private constant SELLER = address(0xA11CE5);
    address private constant BUYER = address(0xB0B5);
    address private constant STRANGER = address(0x5757);
    uint128 private constant DEPOSIT = 1_000e6;

    StreamPaymentVault private vault;

    function setUp() public {
        require(block.chainid == 11155111, "run with a Sepolia fork URL");
        vault = new StreamPaymentVault(address(SOURCE_TOKEN), address(LOCKUP));
        VM.prank(PAYER);
        SOURCE_TOKEN.approve(address(LOCKUP), type(uint256).max);
    }

    function create(bool cancelable) private returns (uint256 streamId) {
        VM.prank(PAYER);
        streamId = LOCKUP.createWithDurationsLL(
            CreateWithDurations(PAYER, SELLER, DEPOSIT, SOURCE_TOKEN, cancelable, true, "morrow-fork"),
            UnlockAmounts(0, 0),
            0,
            Durations(0, 3600)
        );
    }

    function test_realLockupRejectsCancelableStream() public {
        uint256 streamId = create(true);
        VM.prank(SELLER);
        LOCKUP.approve(address(vault), streamId);
        VM.prank(SELLER);
        VM.expectRevert(StreamPaymentVault.UnsupportedStream.selector);
        vault.wrapStream(streamId, bytes32(0));
    }

    function test_realLockupStreamSellsAndRedeemsExactEntitlement() public {
        uint256 streamId = create(false);
        VM.prank(SELLER);
        LOCKUP.approve(address(vault), streamId);
        VM.prank(SELLER);
        uint256 claimId = vault.wrapStream(streamId, bytes32(0));
        require(LOCKUP.ownerOf(streamId) == address(vault));
        SourceTypes.Claim memory claim = vault.getClaim(claimId);
        require(claim.sourceFaceValueRaw == DEPOSIT && claim.maturity == block.timestamp + 3600);

        VM.warp(block.timestamp + 1800);
        VM.prank(STRANGER);
        LOCKUP.withdrawMax(streamId, address(vault));

        SaleTermsLib.Terms memory terms = SaleTermsLib.Terms(
            1,
            11155111,
            address(vault),
            claimId,
            1,
            102031,
            address(0x1002),
            SELLER,
            BUYER,
            address(SOURCE_TOKEN),
            DEPOSIT,
            claim.maturity,
            address(0x1006),
            941e6,
            50,
            PAYER,
            block.timestamp + 300,
            block.timestamp + 600
        );
        VM.prank(SELLER);
        vault.reserveSale(claimId, terms);
        VM.prank(SELLER);
        vault.assignSale(claimId, 1, SaleTermsLib.termsHash(terms));

        VM.warp(claim.maturity);
        uint256 before = SOURCE_TOKEN.balanceOf(BUYER);
        vault.redeem(claimId);
        require(SOURCE_TOKEN.balanceOf(BUYER) - before == DEPOSIT);
        require(SOURCE_TOKEN.balanceOf(address(vault)) == 0);
        require(vault.totalBacking() == 0);
    }
}
