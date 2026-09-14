// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MorrowTestFaucet} from "../../src/testnet/MorrowTestFaucet.sol";
import {MorrowTestToken} from "../../src/testnet/MorrowTestToken.sol";

interface VmFaucet {
    function chainId(uint256) external;
    function warp(uint256) external;
    function prank(address) external;
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
}

contract MorrowTestFaucetTest {
    VmFaucet internal constant vm = VmFaucet(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 internal constant DRIP = 20_000e6;
    uint256 internal constant COOLDOWN = 1 days;
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);

    MorrowTestToken internal token;
    MorrowTestFaucet internal faucet;

    function setUp() public {
        vm.chainId(11155111);
        vm.warp(1_800_000_000);
        token = new MorrowTestToken("Morrow Source", "mSRC", 6, 100_000e6);
        faucet = new MorrowTestFaucet(address(token), DRIP, COOLDOWN);
        token.transfer(address(faucet), 50_000e6);
    }

    function test_dripPaysExactAmountToCaller() public {
        vm.prank(ALICE);
        faucet.drip();
        require(token.balanceOf(ALICE) == DRIP);
        require(token.balanceOf(address(faucet)) == 30_000e6);
        require(faucet.nextDripAt(ALICE) == block.timestamp + COOLDOWN);
    }

    function test_repeatDripWaitsForCooldown() public {
        vm.prank(ALICE);
        faucet.drip();
        vm.warp(block.timestamp + COOLDOWN - 1);
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(MorrowTestFaucet.DripNotReady.selector, block.timestamp + 1));
        faucet.drip();
        vm.warp(block.timestamp + 1);
        vm.prank(ALICE);
        faucet.drip();
        require(token.balanceOf(ALICE) == 2 * DRIP);
    }

    function test_cooldownIsPerRecipient() public {
        vm.prank(ALICE);
        faucet.drip();
        vm.prank(BOB);
        faucet.drip();
        require(token.balanceOf(BOB) == DRIP);
    }

    function test_insufficientBalanceRevertsWithoutConsumingCooldown() public {
        vm.prank(ALICE);
        faucet.drip();
        vm.prank(BOB);
        faucet.drip();
        address carol = address(0xCA201);
        vm.prank(carol);
        vm.expectRevert(MorrowTestFaucet.FaucetEmpty.selector);
        faucet.drip();
        require(faucet.nextDripAt(carol) == 0);
        token.transfer(address(faucet), DRIP);
        vm.prank(carol);
        faucet.drip();
        require(token.balanceOf(carol) == DRIP);
    }

    function test_constructorRejectsNonTestnetChain() public {
        vm.chainId(1);
        vm.expectRevert(MorrowTestFaucet.InvalidTestnetFaucet.selector);
        new MorrowTestFaucet(address(token), DRIP, COOLDOWN);
    }

    function test_constructorRejectsInvalidConfiguration() public {
        vm.expectRevert(MorrowTestFaucet.InvalidTestnetFaucet.selector);
        new MorrowTestFaucet(address(0), DRIP, COOLDOWN);
        vm.expectRevert(MorrowTestFaucet.InvalidTestnetFaucet.selector);
        new MorrowTestFaucet(ALICE, DRIP, COOLDOWN);
        vm.expectRevert(MorrowTestFaucet.InvalidTestnetFaucet.selector);
        new MorrowTestFaucet(address(token), 0, COOLDOWN);
        vm.expectRevert(MorrowTestFaucet.InvalidTestnetFaucet.selector);
        new MorrowTestFaucet(address(token), DRIP, 0);
    }

    function testFuzz_totalDrippedNeverExceedsFunding(uint8 recipients) public {
        uint256 paid;
        for (uint160 i = 1; i <= recipients; ++i) {
            address recipient = address(0x10000 + i);
            if (token.balanceOf(address(faucet)) < DRIP) {
                vm.prank(recipient);
                vm.expectRevert(MorrowTestFaucet.FaucetEmpty.selector);
                faucet.drip();
            } else {
                vm.prank(recipient);
                faucet.drip();
                paid += DRIP;
            }
        }
        require(paid + token.balanceOf(address(faucet)) == 50_000e6);
    }
}
