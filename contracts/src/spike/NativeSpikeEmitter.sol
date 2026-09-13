// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

contract NativeSpikeEmitter {
    event ProbeEmitted(bytes32 indexed probeId, address indexed actor, uint256 amount, bytes32 commitment);

    error WrongNetwork();
    error InvalidAmount();

    uint256 public sequence;

    constructor() {
        if (block.chainid != 11155111) revert WrongNetwork();
    }

    function emitProbe(uint256 amount) external returns (bytes32 probeId) {
        if (amount == 0) revert InvalidAmount();
        probeId = keccak256(abi.encode(block.chainid, address(this), ++sequence));
        emit ProbeEmitted(probeId, msg.sender, amount, keccak256(abi.encode(probeId, msg.sender, amount)));
    }
}
