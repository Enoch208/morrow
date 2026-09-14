// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IStreamLockup {
    function ownerOf(uint256 streamId) external view returns (address);
    function transferFrom(address from, address to, uint256 streamId) external;
    function getUnderlyingToken(uint256 streamId) external view returns (address);
    function getLockupModel(uint256 streamId) external view returns (uint8);
    function getSender(uint256 streamId) external view returns (address);
    function getEndTime(uint256 streamId) external view returns (uint40);
    function getDepositedAmount(uint256 streamId) external view returns (uint128);
    function getWithdrawnAmount(uint256 streamId) external view returns (uint128);
    function getRefundedAmount(uint256 streamId) external view returns (uint128);
    function isCancelable(uint256 streamId) external view returns (bool);
    function wasCanceled(uint256 streamId) external view returns (bool);
    function isTransferable(uint256 streamId) external view returns (bool);
    function isDepleted(uint256 streamId) external view returns (bool);
    function withdrawMax(uint256 streamId, address to) external payable returns (uint128);
}
