// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {
    INativeQueryVerifier,
    NativeQueryVerifierLib
} from "@gluwa/asc-contracts/contracts/write-ability/common/INativeQueryVerifier.sol";
import {EvmV1Decoder} from "@gluwa/asc-contracts/contracts/common/EvmV1Decoder.sol";
import {AttestcoinGate} from "./AttestcoinGate.sol";
import {IChainInfo} from "./IChainInfo.sol";

library AttestcoinGateV2 {
    IChainInfo internal constant CHAIN_INFO = IChainInfo(0x0000000000000000000000000000000000000fD3);
    uint64 internal constant SOURCE_CHAIN_KEY = 1;
    uint64 internal constant SOURCE_CHAIN_ID = 11155111;
    uint64 internal constant MIN_ATTESTED_DEPTH = 64;

    error WrongChainKey();
    error UnsupportedSourceChain();
    error InsufficientAttestedDepth(uint64 attestedHeight, uint64 requiredHeight);
    error NativeVerificationFailed();
    error FailedReceipt();
    error LogIndexOutOfRange();
    error WrongEmitter();
    error WrongEventSignature();

    function authenticate(
        AttestcoinGate.ProofEnvelope calldata proof,
        uint256 receiptLocalLogIndex,
        address expectedEmitter,
        bytes32 expectedSignature
    ) internal returns (EvmV1Decoder.LogEntry memory entry, bytes32 eventKey) {
        if (proof.chainKey != SOURCE_CHAIN_KEY) revert WrongChainKey();
        IChainInfo.ChainLookup memory chain = CHAIN_INFO.get_chain_by_key(proof.chainKey);
        if (!chain.exists || chain.info.chainKey != proof.chainKey || chain.info.chainId != SOURCE_CHAIN_ID) {
            revert UnsupportedSourceChain();
        }
        IChainInfo.AttestationPoint memory latest = CHAIN_INFO.get_latest_attestation_height_and_hash(proof.chainKey);
        uint64 requiredHeight = proof.blockHeight + MIN_ATTESTED_DEPTH;
        if (!latest.exists || latest.height < requiredHeight) {
            revert InsufficientAttestedDepth(latest.height, requiredHeight);
        }
        INativeQueryVerifier verifier = NativeQueryVerifierLib.getVerifier();
        if (!verifier.verifyAndEmit(
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
