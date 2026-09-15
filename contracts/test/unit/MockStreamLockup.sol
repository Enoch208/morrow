// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockStreamLockup is ERC721 {
    struct Stream {
        address sender;
        address token;
        uint128 deposited;
        uint128 withdrawn;
        uint128 refunded;
        uint40 start;
        uint40 end;
        uint8 model;
        bool cancelable;
        bool transferable;
        bool canceled;
        bool depleted;
    }

    uint256 public nextStreamId = 1;
    uint256 public minFeeWei;
    uint128 public reportedSkew;
    mapping(uint256 => Stream) public streams;

    error InsufficientFee();
    error NotAllowed();
    error Overdraw();
    error NotTransferable();

    constructor() ERC721("Mock Lockup", "MLK") {}

    function setMinFee(uint256 fee) external {
        minFeeWei = fee;
    }

    function setReportedSkew(uint128 skew) external {
        reportedSkew = skew;
    }

    function create(
        address recipient,
        address token,
        uint128 deposit,
        uint40 start,
        uint40 end,
        uint8 model,
        bool cancelable,
        bool transferable
    ) external returns (uint256 streamId) {
        IERC20(token).transferFrom(msg.sender, address(this), deposit);
        streamId = nextStreamId++;
        streams[streamId] =
            Stream(msg.sender, token, deposit, 0, 0, start, end, model, cancelable, transferable, false, false);
        _mint(recipient, streamId);
    }

    function streamedAmountOf(uint256 streamId) public view returns (uint128) {
        Stream memory stream = streams[streamId];
        if (stream.canceled) return stream.deposited - stream.refunded;
        if (block.timestamp >= stream.end) return stream.deposited;
        if (block.timestamp <= stream.start) return 0;
        return uint128((uint256(stream.deposited) * (block.timestamp - stream.start)) / (stream.end - stream.start));
    }

    function withdraw(uint256 streamId, address to, uint128 amount) public payable {
        Stream storage stream = streams[streamId];
        if (msg.value < minFeeWei) revert InsufficientFee();
        address recipient = _ownerOf(streamId);
        if (to != recipient && msg.sender != recipient && !_isAuthorized(recipient, msg.sender, streamId)) {
            revert NotAllowed();
        }
        if (amount == 0 || amount > streamedAmountOf(streamId) - stream.withdrawn) revert Overdraw();
        stream.withdrawn += amount;
        if (stream.withdrawn >= stream.deposited - stream.refunded) {
            stream.depleted = true;
            stream.cancelable = false;
        }
        IERC20(stream.token).transfer(to, amount);
    }

    function withdrawMax(uint256 streamId, address to) external payable returns (uint128 amount) {
        amount = streamedAmountOf(streamId) - streams[streamId].withdrawn;
        withdraw(streamId, to, amount);
        amount -= reportedSkew;
    }

    function cancel(uint256 streamId) external {
        Stream storage stream = streams[streamId];
        if (msg.sender != stream.sender || !stream.cancelable || streamedAmountOf(streamId) >= stream.deposited) {
            revert NotAllowed();
        }
        uint128 refund = stream.deposited - streamedAmountOf(streamId);
        stream.refunded = refund;
        stream.canceled = true;
        stream.cancelable = false;
        IERC20(stream.token).transfer(stream.sender, refund);
    }

    function renounce(uint256 streamId) external {
        if (msg.sender != streams[streamId].sender) revert NotAllowed();
        streams[streamId].cancelable = false;
    }

    function _update(address to, uint256 streamId, address auth) internal override returns (address) {
        address from = _ownerOf(streamId);
        if (from != address(0) && to != address(0) && !streams[streamId].transferable) revert NotTransferable();
        return super._update(to, streamId, auth);
    }

    function getUnderlyingToken(uint256 streamId) external view returns (address) {
        return streams[streamId].token;
    }

    function getLockupModel(uint256 streamId) external view returns (uint8) {
        return streams[streamId].model;
    }

    function getSender(uint256 streamId) external view returns (address) {
        return streams[streamId].sender;
    }

    function getEndTime(uint256 streamId) external view returns (uint40) {
        return streams[streamId].end;
    }

    function getDepositedAmount(uint256 streamId) external view returns (uint128) {
        return streams[streamId].deposited;
    }

    function getWithdrawnAmount(uint256 streamId) external view returns (uint128) {
        return streams[streamId].withdrawn;
    }

    function getRefundedAmount(uint256 streamId) external view returns (uint128) {
        return streams[streamId].refunded;
    }

    function isCancelable(uint256 streamId) external view returns (bool) {
        return streams[streamId].cancelable && streamedAmountOf(streamId) < streams[streamId].deposited;
    }

    function wasCanceled(uint256 streamId) external view returns (bool) {
        return streams[streamId].canceled;
    }

    function isTransferable(uint256 streamId) external view returns (bool) {
        return streams[streamId].transferable;
    }

    function isDepleted(uint256 streamId) external view returns (bool) {
        return streams[streamId].depleted;
    }
}
