// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LifecycleFixture, VmLifecycle} from "../invariant/LifecycleFixture.sol";
import {FundedPaymentVault} from "../../src/source/FundedPaymentVault.sol";
import {SaleTermsLib} from "../../src/libraries/SaleTermsLib.sol";
import {AttestcoinGate} from "../../src/libraries/AttestcoinGate.sol";
import {EvmV1Decoder} from "@gluwa/asc-contracts/contracts/common/EvmV1Decoder.sol";
import {INativeQueryVerifier} from "@gluwa/asc-contracts/contracts/write-ability/common/INativeQueryVerifier.sol";

contract PairSourceCaller {
    function reservePair(FundedPaymentVault vault, SaleTermsLib.Terms calldata a, SaleTermsLib.Terms calldata b)
        external
    {
        vault.reserveSale(a.claimId, a);
        vault.reserveSale(b.claimId, b);
    }

    function cancelPair(FundedPaymentVault vault, uint256 first, uint256 second) external {
        vault.cancelExpiredSale(first, 1);
        vault.cancelExpiredSale(second, 1);
    }
}

abstract contract MultiLogFixture is LifecycleFixture {
    address internal constant BUYER = address(0x6000);
    PairSourceCaller internal caller = new PairSourceCaller();

    function createPair() internal returns (SaleTermsLib.Terms[2] memory pair) {
        vm.chainId(11155111);
        for (uint256 i = 0; i < 2; i++) {
            uint256 id = vault.createClaim(address(source), 10000, address(caller), 3000, bytes32(0));
            backing += 10000;
            pair[i] = SaleTermsLib.Terms(
                1,
                11155111,
                address(vault),
                id,
                1,
                102031,
                address(market),
                address(caller),
                BUYER,
                address(source),
                10000,
                3000,
                address(settlement),
                9410 - i * 699,
                50,
                FEE,
                1800,
                2000
            );
        }
    }

    function reservePair(SaleTermsLib.Terms[2] memory pair) internal returns (AttestcoinGate.ProofEnvelope memory) {
        vm.chainId(11155111);
        vm.recordLogs();
        caller.reservePair(vault, pair[0], pair[1]);
        return capturedPair();
    }

    function cancelPair(SaleTermsLib.Terms[2] memory pair) internal returns (AttestcoinGate.ProofEnvelope memory) {
        vm.chainId(11155111);
        vm.warp(2000);
        vm.recordLogs();
        caller.cancelPair(vault, pair[0].claimId, pair[1].claimId);
        return capturedPair();
    }

    function capturedPair() private returns (AttestcoinGate.ProofEnvelope memory proof) {
        VmLifecycle.Log[] memory captured = vm.getRecordedLogs();
        require(captured.length == 2);
        EvmV1Decoder.LogEntry[] memory logs = new EvmV1Decoder.LogEntry[](2);
        for (uint256 i = 0; i < 2; i++) {
            require(captured[i].emitter == address(vault));
            logs[i] = EvmV1Decoder.LogEntry(captured[i].emitter, captured[i].topics, captured[i].data);
        }
        require(logs[0].topics[1] != logs[1].topics[1]);
        bytes[] memory chunks = new bytes[](3);
        chunks[0] = abi.encode(uint64(0), uint64(1000000), address(this), false, address(caller), uint256(0), hex"");
        chunks[1] = hex"";
        chunks[2] = abi.encode(uint8(1), uint64(500000), logs, new bytes(256));
        proof.chainKey = 1;
        proof.blockHeight = ++proofHeight;
        proof.encodedTransaction = abi.encode(uint8(2), chunks);
        proof.merkleProof.siblings = new INativeQueryVerifier.MerkleProofEntry[](0);
        proof.continuityProof.roots = new bytes32[](0);
        vm.chainId(102031);
    }

    function key(uint64 height, uint256 index) internal pure returns (bytes32) {
        return keccak256(abi.encode(uint64(1), height, uint64(0), index));
    }

    function snapshot(SaleTermsLib.Terms[2] memory pair) internal view returns (bytes32) {
        bytes32 claims = keccak256(
            abi.encode(
                vault.getClaim(pair[0].claimId),
                vault.getClaim(pair[1].claimId),
                vault.getRound(pair[0].claimId, 1),
                vault.getRound(pair[1].claimId, 1),
                vault.totalBacking(),
                source.balanceOf(address(vault)),
                source.balanceOf(address(caller))
            )
        );
        bytes32 sales = keccak256(
            abi.encode(
                market.getSale(SaleTermsLib.saleId(pair[0])),
                market.getSale(SaleTermsLib.saleId(pair[1])),
                market.totalBound(),
                market.totalCredits(),
                market.totalLiabilities(),
                market.credits(BUYER),
                market.credits(address(caller)),
                market.credits(FEE),
                settlement.balanceOf(address(market)),
                settlement.balanceOf(BUYER),
                settlement.balanceOf(address(caller)),
                settlement.balanceOf(FEE)
            )
        );
        bytes32 consumed;
        for (uint64 height = 1; height <= proofHeight; height++) {
            consumed = keccak256(abi.encode(consumed, market.consumed(key(height, 0)), market.consumed(key(height, 1))));
        }
        return keccak256(abi.encode(claims, sales, consumed));
    }
}
