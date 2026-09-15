// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AttestcoinGate} from "../../src/libraries/AttestcoinGate.sol";
import {SaleTermsLib} from "../../src/libraries/SaleTermsLib.sol";
import {INativeQueryVerifier} from "@gluwa/asc-contracts/contracts/write-ability/common/INativeQueryVerifier.sol";
import {RealProofHarness} from "./RealProofHarness.sol";

interface VmRealProof {
    function chainId(uint256) external;
    function projectRoot() external view returns (string memory);
    function readFile(string calldata) external view returns (string memory);
    function parseJsonUint(string calldata, string calldata) external pure returns (uint256);
    function parseJsonAddress(string calldata, string calldata) external pure returns (address);
    function parseJsonBytes(string calldata, string calldata) external pure returns (bytes memory);
    function parseJsonBytes32(string calldata, string calldata) external pure returns (bytes32);
    function parseJsonBytes32Array(string calldata, string calldata) external pure returns (bytes32[] memory);
    function parseJsonBoolArray(string calldata, string calldata) external pure returns (bool[] memory);
    function mockCall(address, bytes calldata, bytes calldata) external;
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
}

abstract contract RealProofBase {
    VmRealProof internal constant vm = VmRealProof(address(uint160(uint256(keccak256("hevm cheat code")))));
    address internal constant NATIVE = 0x0000000000000000000000000000000000000FD2;
    address internal constant LIVE_VAULT = 0xEF6EE2fa664da7D3d710b272850CFAa6Ac73D583;
    bytes4 internal constant VERIFY =
        bytes4(keccak256("verify(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))"));
    bytes4 internal constant VERIFY_AND_EMIT =
        bytes4(keccak256("verifyAndEmit(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))"));

    struct Fixture {
        AttestcoinGate.ProofEnvelope proof;
        SaleTermsLib.Terms terms;
        uint256 logIndex;
        uint64 txIndex;
        bytes32 eventKey;
        bytes32 saleId;
        bytes32 termsHash;
        bytes32 consumerCalldataHash;
    }

    RealProofHarness internal harness;

    function setUp() public virtual {
        vm.chainId(102031);
        harness = new RealProofHarness();
    }

    function load(string memory name) internal view returns (Fixture memory f) {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/test/fixtures/", name, ".json"));
        f.proof = readProof(json);
        f.terms = readTerms(json);
        f.logIndex = vm.parseJsonUint(json, ".receiptLocalLogIndex");
        f.txIndex = uint64(vm.parseJsonUint(json, ".txIndex"));
        f.eventKey = vm.parseJsonBytes32(json, ".eventKey");
        f.saleId = vm.parseJsonBytes32(json, ".saleId");
        f.termsHash = vm.parseJsonBytes32(json, ".termsHash");
        f.consumerCalldataHash = vm.parseJsonBytes32(json, ".consumerCalldataHash");
    }

    function loadVerified(string memory name, bytes4 verifySelector) internal returns (Fixture memory f) {
        f = load(name);
        require(SaleTermsLib.termsHash(f.terms) == f.termsHash, "recorded termsHash");
        require(SaleTermsLib.saleId(f.terms) == f.saleId, "recorded saleId");
        acceptOnlyExactProof(f, verifySelector);
    }

    function acceptOnlyExactProof(Fixture memory f, bytes4 verifySelector) internal {
        vm.mockCall(NATIVE, abi.encodePacked(verifySelector), abi.encode(false));
        vm.mockCall(NATIVE, verifyCalldata(f.proof, verifySelector), abi.encode(true));
        vm.mockCall(
            NATIVE, abi.encodeCall(INativeQueryVerifier.calculateTxIndex, (f.proof.merkleProof)), abi.encode(f.txIndex)
        );
    }

    function verifyCalldata(AttestcoinGate.ProofEnvelope memory proof, bytes4 verifySelector)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encodeWithSelector(
            verifySelector,
            proof.chainKey,
            proof.blockHeight,
            proof.encodedTransaction,
            proof.merkleProof,
            proof.continuityProof
        );
    }

    function withFlippedByte(AttestcoinGate.ProofEnvelope memory proof)
        internal
        pure
        returns (AttestcoinGate.ProofEnvelope memory)
    {
        bytes memory flipped = bytes.concat(proof.encodedTransaction);
        flipped[flipped.length / 2] ^= 0x01;
        return AttestcoinGate.ProofEnvelope(
            proof.chainKey, proof.blockHeight, flipped, proof.merkleProof, proof.continuityProof
        );
    }

    function readProof(string memory json) private pure returns (AttestcoinGate.ProofEnvelope memory proof) {
        proof.chainKey = uint64(vm.parseJsonUint(json, ".chainKey"));
        proof.blockHeight = uint64(vm.parseJsonUint(json, ".blockHeight"));
        proof.encodedTransaction = vm.parseJsonBytes(json, ".encodedTransaction");
        proof.merkleProof.root = vm.parseJsonBytes32(json, ".merkleRoot");
        bytes32[] memory hashes = vm.parseJsonBytes32Array(json, ".siblingHashes");
        bool[] memory isLeft = vm.parseJsonBoolArray(json, ".siblingIsLeft");
        require(hashes.length == isLeft.length, "sibling arrays");
        proof.merkleProof.siblings = new INativeQueryVerifier.MerkleProofEntry[](hashes.length);
        for (uint256 i; i < hashes.length; ++i) {
            proof.merkleProof.siblings[i] = INativeQueryVerifier.MerkleProofEntry(hashes[i], isLeft[i]);
        }
        proof.continuityProof.lowerEndpointDigest = vm.parseJsonBytes32(json, ".lowerEndpointDigest");
        proof.continuityProof.roots = vm.parseJsonBytes32Array(json, ".continuityRoots");
    }

    function readTerms(string memory json) private pure returns (SaleTermsLib.Terms memory t) {
        t.protocolVersion = vm.parseJsonUint(json, ".terms.protocolVersion");
        t.sourceEvmChainId = vm.parseJsonUint(json, ".terms.sourceEvmChainId");
        t.sourceVault = vm.parseJsonAddress(json, ".terms.sourceVault");
        t.claimId = vm.parseJsonUint(json, ".terms.claimId");
        t.round = vm.parseJsonUint(json, ".terms.round");
        t.destinationEvmChainId = vm.parseJsonUint(json, ".terms.destinationEvmChainId");
        t.destinationMarket = vm.parseJsonAddress(json, ".terms.destinationMarket");
        t.seller = vm.parseJsonAddress(json, ".terms.seller");
        t.buyer = vm.parseJsonAddress(json, ".terms.buyer");
        t.sourceToken = vm.parseJsonAddress(json, ".terms.sourceToken");
        t.sourceFaceValueRaw = vm.parseJsonUint(json, ".terms.sourceFaceValueRaw");
        t.maturity = vm.parseJsonUint(json, ".terms.maturity");
        t.settlementToken = vm.parseJsonAddress(json, ".terms.settlementToken");
        t.grossPurchasePriceRaw = vm.parseJsonUint(json, ".terms.grossPurchasePriceRaw");
        t.feeBps = uint16(vm.parseJsonUint(json, ".terms.feeBps"));
        t.feeRecipient = vm.parseJsonAddress(json, ".terms.feeRecipient");
        t.fundBefore = vm.parseJsonUint(json, ".terms.fundBefore");
        t.assignBefore = vm.parseJsonUint(json, ".terms.assignBefore");
    }
}
