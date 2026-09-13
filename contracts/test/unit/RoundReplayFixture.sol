// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LifecycleFixture} from "../invariant/LifecycleFixture.sol";
import {SaleTermsLib} from "../../src/libraries/SaleTermsLib.sol";
import {AttestcoinGate} from "../../src/libraries/AttestcoinGate.sol";

abstract contract RoundReplayFixture is LifecycleFixture {
    address internal constant SELLER = address(0x5000);
    address internal constant BUYER = address(0x6000);
    address internal constant RELAYER_A = address(0x8000);
    address internal constant RELAYER_B = address(0x8001);

    function createTerms() internal returns (SaleTermsLib.Terms memory terms) {
        vm.chainId(11155111);
        uint256 claimId = vault.createClaim(address(source), 10000, SELLER, 3000, bytes32(0));
        backing = 10000;
        terms = SaleTermsLib.Terms(
            1,
            11155111,
            address(vault),
            claimId,
            1,
            102031,
            address(market),
            SELLER,
            BUYER,
            address(source),
            10000,
            3000,
            address(settlement),
            9410,
            50,
            FEE,
            1100,
            1200
        );
    }

    function cancelSource(SaleTermsLib.Terms memory terms)
        internal
        returns (AttestcoinGate.ProofEnvelope memory proof)
    {
        vm.chainId(11155111);
        vm.warp(terms.assignBefore);
        vm.recordLogs();
        vault.cancelExpiredSale(terms.claimId, terms.round);
        proof = capturedProof();
        vm.chainId(102031);
    }

    function assignSource(SaleTermsLib.Terms memory terms)
        internal
        returns (AttestcoinGate.ProofEnvelope memory proof)
    {
        vm.chainId(11155111);
        vm.recordLogs();
        vm.prank(SELLER);
        vault.assignSale(terms.claimId, terms.round, SaleTermsLib.termsHash(terms));
        proof = capturedProof();
        vm.chainId(102031);
    }

    function eventKey(AttestcoinGate.ProofEnvelope memory proof) internal pure returns (bytes32) {
        return keccak256(abi.encode(proof.chainKey, proof.blockHeight, uint64(0), uint256(0)));
    }

    function snapshot(uint256 claimId, bytes32 first, bytes32 second) internal view returns (bytes32) {
        bytes32 sourceState = keccak256(
            abi.encode(
                vault.getClaim(claimId),
                vault.getRound(claimId, 1),
                vault.getRound(claimId, 2),
                vault.totalBacking(),
                vault.nextClaimId(),
                source.balanceOf(address(vault)),
                source.balanceOf(SELLER),
                source.balanceOf(BUYER)
            )
        );
        bytes32 marketState = keccak256(
            abi.encode(
                market.getSale(first),
                market.getSale(second),
                market.totalBound(),
                market.totalCredits(),
                market.totalLiabilities(),
                market.credits(SELLER),
                market.credits(BUYER),
                market.credits(FEE),
                settlement.balanceOf(address(market)),
                settlement.balanceOf(SELLER),
                settlement.balanceOf(BUYER),
                settlement.balanceOf(FEE)
            )
        );
        bytes32 consumption;
        for (uint64 height = 1; height <= proofHeight; height++) {
            bytes32 key = keccak256(abi.encode(uint64(1), height, uint64(0), uint256(0)));
            consumption = keccak256(abi.encode(consumption, key, market.consumed(key)));
        }
        return keccak256(abi.encode(sourceState, marketState, consumption));
    }
}
