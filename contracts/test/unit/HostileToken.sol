// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract HostileToken is ERC20 {
    bool public tax;
    bool public rejectTransfers;
    address public callbackTarget;
    bytes public callbackData;
    bool public callbackSucceeded;

    error RejectedTransfer();

    constructor() ERC20("Local adversarial token", "HOSTILE") {
        _mint(msg.sender, 1000000000);
    }

    function configure(bool taxed, bool rejecting, address target, bytes calldata data) external {
        tax = taxed;
        rejectTransfers = rejecting;
        callbackTarget = target;
        callbackData = data;
    }

    function _update(address from, address to, uint256 amount) internal override {
        if (from != address(0) && to != address(0)) {
            if (rejectTransfers) revert RejectedTransfer();
            if (callbackTarget != address(0)) {
                (callbackSucceeded,) = callbackTarget.call(callbackData);
            }
            if (tax && amount > 1) {
                super._update(from, address(0), 1);
                amount--;
            }
        }
        super._update(from, to, amount);
    }
}
