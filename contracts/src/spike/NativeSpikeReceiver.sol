// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AttestcoinGate} from "../libraries/AttestcoinGate.sol";
import {EvmV1Decoder} from "@gluwa/asc-contracts/contracts/common/EvmV1Decoder.sol";

contract NativeSpikeReceiver {
    address public immutable approvedEmitter;
    address public immutable approvedActor;
    uint256 public acceptedTotal;
    mapping(bytes32 => bool) public consumed;

    bytes32 private constant SIGNATURE = keccak256("ProbeEmitted(bytes32,address,uint256,bytes32)");

    error WrongNetwork();
    error InvalidConfiguration();
    error InvalidEventLayout();
    error WrongActor();
    error InvalidCommitment();
    error EventAlreadyConsumed();

    event ProbeAccepted(bytes32 indexed eventKey, bytes32 indexed probeId, address indexed actor, uint256 amount);

    constructor(address emitter, address actor) {
        if (block.chainid != 102031) revert WrongNetwork();
        if (emitter == address(0) || actor == address(0)) revert InvalidConfiguration();
        approvedEmitter = emitter;
        approvedActor = actor;
    }

    function accept(AttestcoinGate.ProofEnvelope calldata proof, uint256 receiptLocalLogIndex)
        external
        returns (bytes32 eventKey)
    {
        EvmV1Decoder.LogEntry memory entry;
        (entry, eventKey) = AttestcoinGate.authenticate(proof, receiptLocalLogIndex, 1, approvedEmitter, SIGNATURE);
        if (entry.topics.length != 3 || entry.data.length != 64) revert InvalidEventLayout();
        if (entry.topics[2] != bytes32(uint256(uint160(approvedActor)))) revert WrongActor();
        (uint256 amount, bytes32 commitment) = abi.decode(entry.data, (uint256, bytes32));
        if (amount == 0 || commitment != keccak256(abi.encode(entry.topics[1], approvedActor, amount))) {
            revert InvalidCommitment();
        }
        if (consumed[eventKey]) revert EventAlreadyConsumed();
        consumed[eventKey] = true;
        acceptedTotal += amount;
        emit ProbeAccepted(eventKey, entry.topics[1], approvedActor, amount);
    }
}
