// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {NativeSpikeReceiver} from "../../src/spike/NativeSpikeReceiver.sol";
import {AttestcoinGate} from "../../src/libraries/AttestcoinGate.sol";
import {INativeQueryVerifier} from "@gluwa/asc-contracts/contracts/write-ability/common/INativeQueryVerifier.sol";
import {EvmV1Decoder} from "@gluwa/asc-contracts/contracts/common/EvmV1Decoder.sol";

interface VmSpike {
    function chainId(uint256) external;
    function mockCall(address, bytes calldata, bytes calldata) external;
    function expectRevert(bytes4) external;
}

contract NativeSpikeTest {
    VmSpike private constant vm = VmSpike(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant NATIVE = 0x0000000000000000000000000000000000000FD2;
    address private constant EMITTER = address(0x1001);
    address private constant ACTOR = address(0x1002);
    bytes32 private constant PROBE_ID = keccak256("local-unit-fixture");
    bytes32 private constant VERIFY_SIGNATURE =
        keccak256("verify(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))");
    NativeSpikeReceiver private receiver;

    function setUp() public {
        vm.chainId(102031);
        receiver = new NativeSpikeReceiver(EMITTER, ACTOR);
        vm.mockCall(NATIVE, abi.encodePacked(bytes4(VERIFY_SIGNATURE)), abi.encode(true));
        vm.mockCall(
            NATIVE, abi.encodeWithSelector(INativeQueryVerifier.calculateTxIndex.selector), abi.encode(uint64(7))
        );
    }

    function test_T24_nativeValidUnapprovedEmitterRejected() public {
        AttestcoinGate.ProofEnvelope memory proof = envelope(address(0xBAD), 1, false);
        vm.expectRevert(AttestcoinGate.WrongEmitter.selector);
        receiver.accept(proof, 0);
        require(receiver.acceptedTotal() == 0);
    }

    function test_T28_correctLaterLogAndReplay() public {
        AttestcoinGate.ProofEnvelope memory proof = envelope(EMITTER, 1, true);
        bytes32 key = receiver.accept(proof, 1);
        require(receiver.acceptedTotal() == 23);
        require(key == keccak256(abi.encode(uint64(1), uint64(99), uint64(7), uint256(1))));
        require(receiver.consumed(key));
        vm.expectRevert(NativeSpikeReceiver.EventAlreadyConsumed.selector);
        receiver.accept(proof, 1);
        require(receiver.acceptedTotal() == 23);
    }

    function test_T25_failedReceiptRejected() public {
        vm.expectRevert(AttestcoinGate.FailedReceipt.selector);
        receiver.accept(envelope(EMITTER, 0, false), 0);
    }

    function test_T27_outOfRangeRejected() public {
        vm.expectRevert(AttestcoinGate.LogIndexOutOfRange.selector);
        receiver.accept(envelope(EMITTER, 1, false), 1);
    }

    function test_T22_wrongChainKeyRejected() public {
        AttestcoinGate.ProofEnvelope memory proof = envelope(EMITTER, 1, false);
        proof.chainKey = 11155111;
        vm.expectRevert(AttestcoinGate.WrongChainKey.selector);
        receiver.accept(proof, 0);
    }

    function test_T21_nativeFalseRejected() public {
        vm.mockCall(NATIVE, abi.encodePacked(bytes4(VERIFY_SIGNATURE)), abi.encode(false));
        vm.expectRevert(AttestcoinGate.NativeVerificationFailed.selector);
        receiver.accept(envelope(EMITTER, 1, false), 0);
    }

    function test_T26_wrongSignatureRejectedWithoutConsumption() public {
        AttestcoinGate.ProofEnvelope memory proof = changeTopic(0, keccak256("OtherEvent()"));
        vm.expectRevert(AttestcoinGate.WrongEventSignature.selector);
        receiver.accept(proof, 0);
        require(!receiver.consumed(keccak256(abi.encode(uint64(1), uint64(99), uint64(7), uint256(0)))));
        require(receiver.acceptedTotal() == 0);
    }

    function test_wrongActorRejectedWithoutConsumption() public {
        vm.expectRevert(NativeSpikeReceiver.WrongActor.selector);
        receiver.accept(changeTopic(2, bytes32(uint256(uint160(address(0xBAD))))), 0);
        require(receiver.acceptedTotal() == 0);
    }

    function test_changedCommitmentCanRetryAuthenticEvent() public {
        vm.expectRevert(NativeSpikeReceiver.InvalidCommitment.selector);
        receiver.accept(changeTopic(1, keccak256("wrong-probe-id")), 0);
        require(receiver.acceptedTotal() == 0);
        receiver.accept(envelope(EMITTER, 1, false), 0);
        require(receiver.acceptedTotal() == 23);
    }

    function test_T26_malformedEventLayoutRejected() public {
        AttestcoinGate.ProofEnvelope memory proof = envelope(EMITTER, 1, false);
        (uint8 txType, bytes[] memory chunks) = abi.decode(proof.encodedTransaction, (uint8, bytes[]));
        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(proof.encodedTransaction);
        receipt.receiptLogs[0].data = abi.encode(uint256(23));
        chunks[2] =
            abi.encode(receipt.receiptStatus, receipt.receiptGasUsed, receipt.receiptLogs, receipt.receiptLogsBloom);
        proof.encodedTransaction = abi.encode(txType, chunks);
        vm.expectRevert(NativeSpikeReceiver.InvalidEventLayout.selector);
        receiver.accept(proof, 0);
        require(receiver.acceptedTotal() == 0);
    }

    function changeTopic(uint256 index, bytes32 replacement)
        private
        pure
        returns (AttestcoinGate.ProofEnvelope memory proof)
    {
        proof = envelope(EMITTER, 1, false);
        (uint8 txType, bytes[] memory chunks) = abi.decode(proof.encodedTransaction, (uint8, bytes[]));
        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(proof.encodedTransaction);
        receipt.receiptLogs[0].topics[index] = replacement;
        chunks[2] =
            abi.encode(receipt.receiptStatus, receipt.receiptGasUsed, receipt.receiptLogs, receipt.receiptLogsBloom);
        proof.encodedTransaction = abi.encode(txType, chunks);
    }

    function envelope(address emitter, uint8 status, bool decoy)
        private
        pure
        returns (AttestcoinGate.ProofEnvelope memory proof)
    {
        EvmV1Decoder.LogEntry[] memory logs = new EvmV1Decoder.LogEntry[](decoy ? 2 : 1);
        bytes32[] memory topics = new bytes32[](3);
        topics[0] = keccak256("ProbeEmitted(bytes32,address,uint256,bytes32)");
        topics[1] = PROBE_ID;
        topics[2] = bytes32(uint256(uint160(ACTOR)));
        logs[decoy ? 1 : 0] = EvmV1Decoder.LogEntry(
            emitter, topics, abi.encode(uint256(23), keccak256(abi.encode(PROBE_ID, ACTOR, uint256(23))))
        );
        if (decoy) logs[0] = EvmV1Decoder.LogEntry(address(0xDEC0), new bytes32[](0), hex"");
        bytes[] memory chunks = new bytes[](3);
        chunks[0] = abi.encode(uint64(0), uint64(100000), ACTOR, false, EMITTER, uint256(0), hex"");
        chunks[1] = hex"";
        chunks[2] = abi.encode(status, uint64(50000), logs, new bytes(256));
        proof.chainKey = 1;
        proof.blockHeight = 99;
        proof.encodedTransaction = abi.encode(uint8(2), chunks);
        proof.merkleProof.siblings = new INativeQueryVerifier.MerkleProofEntry[](0);
        proof.continuityProof.roots = new bytes32[](0);
    }
}
