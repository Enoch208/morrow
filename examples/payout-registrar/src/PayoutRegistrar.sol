// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IFundedPaymentVault {
    function SOURCE_TOKEN() external view returns (IERC20);
    function createClaim(address token, uint256 faceValueRaw, address beneficiary, uint256 maturity, bytes32 referenceHash)
        external
        returns (uint256);
}

contract PayoutRegistrar is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IFundedPaymentVault public immutable vault;
    IERC20 public immutable token;

    error TransferDeltaMismatch();

    constructor(IFundedPaymentVault sourceVault) {
        vault = sourceVault;
        token = sourceVault.SOURCE_TOKEN();
    }

    function register(uint256 faceValueRaw, address beneficiary, uint256 maturity, bytes32 referenceHash)
        external
        nonReentrant
        returns (uint256 claimId)
    {
        uint256 balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), faceValueRaw);
        if (token.balanceOf(address(this)) != balanceBefore + faceValueRaw) revert TransferDeltaMismatch();
        token.forceApprove(address(vault), faceValueRaw);
        claimId = vault.createClaim(address(token), faceValueRaw, beneficiary, maturity, referenceHash);
        if (token.balanceOf(address(this)) != balanceBefore) revert TransferDeltaMismatch();
    }
}
