// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract MorrowTestFaucet is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable TOKEN;
    uint256 public immutable DRIP_AMOUNT;
    uint256 public immutable COOLDOWN;
    mapping(address => uint256) public nextDripAt;

    error InvalidTestnetFaucet();
    error DripNotReady(uint256 availableAt);
    error FaucetEmpty();

    event Dripped(address indexed recipient, uint256 amount, uint256 nextDripAt);

    constructor(address token, uint256 dripAmount, uint256 cooldown) {
        if (
            (block.chainid != 11155111 && block.chainid != 102031) || token.code.length == 0 || dripAmount == 0
                || cooldown == 0
        ) revert InvalidTestnetFaucet();
        TOKEN = IERC20(token);
        DRIP_AMOUNT = dripAmount;
        COOLDOWN = cooldown;
    }

    function drip() external nonReentrant {
        uint256 availableAt = nextDripAt[msg.sender];
        if (block.timestamp < availableAt) revert DripNotReady(availableAt);
        if (TOKEN.balanceOf(address(this)) < DRIP_AMOUNT) revert FaucetEmpty();
        uint256 next = block.timestamp + COOLDOWN;
        nextDripAt[msg.sender] = next;
        TOKEN.safeTransfer(msg.sender, DRIP_AMOUNT);
        emit Dripped(msg.sender, DRIP_AMOUNT, next);
    }
}
