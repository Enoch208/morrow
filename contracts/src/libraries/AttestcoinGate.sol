// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {
    INativeQueryVerifier,
    NativeQueryVerifierLib
} from "@gluwa/asc-contracts/contracts/write-ability/common/INativeQueryVerifier.sol";
import {EvmV1Decoder} from "@gluwa/asc-contracts/contracts/common/EvmV1Decoder.sol";

library AttestcoinGate {
    struct ProofEnvelope {
        uint64 chainKey;
        uint64 blockHeight;
        bytes encodedTransaction;
        INativeQueryVerifier.MerkleProof merkleProof;
        INativeQueryVerifier.ContinuityProof continuityProof;
    }

    error WrongChainKey();
    error NativeVerificationFailed();
    error FailedReceipt();
    error LogIndexOutOfRange();
    error WrongEmitter();
    error WrongEventSignature();

    function authenticate(
        ProofEnvelope calldata proof,
        uint256 receiptLocalLogIndex,
        uint64 expectedChainKey,
        address expectedEmitter,
        bytes32 expectedSignature
    ) internal view returns (EvmV1Decoder.LogEntry memory entry, bytes32 eventKey) {
        if (proof.chainKey != expectedChainKey) revert WrongChainKey();
        INativeQueryVerifier verifier = NativeQueryVerifierLib.getVerifier();
        if (!verifier.verify(
                proof.chainKey, proof.blockHeight, proof.encodedTransaction, proof.merkleProof, proof.continuityProof
            )) {
            revert NativeVerificationFailed();
        }
        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(proof.encodedTransaction);
        if (receipt.receiptStatus != 1) revert FailedReceipt();
        if (receiptLocalLogIndex >= receipt.receiptLogs.length) revert LogIndexOutOfRange();
        entry = receipt.receiptLogs[receiptLocalLogIndex];
        if (entry.address_ != expectedEmitter) revert WrongEmitter();
        if (entry.topics.length == 0 || entry.topics[0] != expectedSignature) revert WrongEventSignature();
        uint64 txIndex = verifier.calculateTxIndex(proof.merkleProof);
        eventKey = keccak256(abi.encode(proof.chainKey, proof.blockHeight, txIndex, receiptLocalLogIndex));
    }
}
