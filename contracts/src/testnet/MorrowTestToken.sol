// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MorrowTestToken is ERC20 {
    uint8 private immutable TOKEN_DECIMALS;
    error InvalidTestnetToken();

    constructor(string memory name, string memory symbol, uint8 tokenDecimals, uint256 initialSupply)
        ERC20(name, symbol)
    {
        if ((block.chainid != 11155111 && block.chainid != 102031) || tokenDecimals > 18 || initialSupply == 0) {
            revert InvalidTestnetToken();
        }
        TOKEN_DECIMALS = tokenDecimals;
        _mint(msg.sender, initialSupply);
    }

    function decimals() public view override returns (uint8) {
        return TOKEN_DECIMALS;
    }
}
