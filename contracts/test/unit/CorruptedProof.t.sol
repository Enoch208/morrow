// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MarketFixture} from "./MarketFixture.sol";
import {NativeMocks} from "./NativeMocks.sol";
import {AttestcoinGate} from "../../src/libraries/AttestcoinGate.sol";
import {INativeQueryVerifier} from "@gluwa/asc-contracts/contracts/write-ability/common/INativeQueryVerifier.sol";
import {MarketTypes} from "../../src/destination/MarketTypes.sol";
import {SaleTermsLib} from "../../src/libraries/SaleTermsLib.sol";

contract CorruptedProofTest is MarketFixture {
    function test_T21_corruptedMerkleContinuityAndBytesNativeRejectWithoutFunding() public {
        AttestcoinGate.ProofEnvelope memory forged = reservation(terms);
        forged.merkleProof.root = bytes32(uint256(1));
        rejectNative(forged);
        forged = reservation(terms);
        forged.merkleProof.siblings = new INativeQueryVerifier.MerkleProofEntry[](1);
        forged.merkleProof.siblings[0] = INativeQueryVerifier.MerkleProofEntry(bytes32(uint256(2)), true);
        rejectNative(forged);
        forged = reservation(terms);
        forged.continuityProof.lowerEndpointDigest = bytes32(uint256(3));
        rejectNative(forged);
        forged = reservation(terms);
        forged.continuityProof.roots = new bytes32[](1);
        forged.continuityProof.roots[0] = bytes32(uint256(4));
        rejectNative(forged);
        forged = reservation(terms);
        forged.encodedTransaction[0] = bytes1(uint8(uint8(forged.encodedTransaction[0]) ^ uint8(1)));
        rejectNative(forged);
        allowNative();
        bytes32 id = fund();
        require(market.getSale(id).state == MarketTypes.State.BOUND);
        require(market.totalBound() == 9410 && token.balanceOf(address(market)) == 9410);
        solvent();
    }

    function test_T23_evmChainIdIsNotAcceptedAsProtocolChainKey() public {
        AttestcoinGate.ProofEnvelope memory proof = reservation(terms);
        proof.chainKey = 11155111;
        require(terms.sourceEvmChainId == 11155111);
        vm.prank(BUYER);
        vm.expectRevert(AttestcoinGate.WrongChainKey.selector);
        market.fundReservation(proof, 0, terms);
        require(market.totalLiabilities() == 0 && token.balanceOf(address(market)) == 0);
        require(market.getSale(SaleTermsLib.saleId(terms)).state == MarketTypes.State.ABSENT);
        fund();
        solvent();
    }

    function rejectNative(AttestcoinGate.ProofEnvelope memory forged) private {
        denyNative();
        uint256 buyer = token.balanceOf(BUYER);
        vm.prank(BUYER);
        vm.expectRevert(AttestcoinGate.NativeVerificationFailed.selector);
        market.fundReservation(forged, 0, terms);
        require(market.totalLiabilities() == 0 && token.balanceOf(address(market)) == 0);
        require(token.balanceOf(BUYER) == buyer);
        require(market.getSale(SaleTermsLib.saleId(terms)).state == MarketTypes.State.ABSENT);
        allowNative();
    }

    function denyNative() private {
        vm.clearMockedCalls();
        NativeMocks.install(false, 7);
    }

    function allowNative() private {
        vm.clearMockedCalls();
        NativeMocks.install(true, 7);
    }
}
