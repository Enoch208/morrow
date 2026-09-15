// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MarketFixture} from "./MarketFixture.sol";
import {NativeMocks} from "./NativeMocks.sol";
import {AttestcoinGate} from "../../src/libraries/AttestcoinGate.sol";
import {AttestcoinGateV2} from "../../src/libraries/AttestcoinGateV2.sol";
import {IChainInfo} from "../../src/libraries/IChainInfo.sol";
import {MarketTypes} from "../../src/destination/MarketTypes.sol";
import {SaleTermsLib} from "../../src/libraries/SaleTermsLib.sol";

interface VmFreshness {
    function expectRevert(bytes calldata) external;
    function expectCall(address, bytes calldata, uint64) external;
    function mockCall(address, bytes calldata, bytes calldata) external;
    function prank(address) external;
}

contract MarketV2FreshnessTest is MarketFixture {
    VmFreshness private constant cheats = VmFreshness(address(uint160(uint256(keccak256("hevm cheat code")))));
    bytes4 private constant VERIFY =
        bytes4(keccak256("verify(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))"));
    bytes4 private constant VERIFY_AND_EMIT =
        bytes4(keccak256("verifyAndEmit(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))"));

    function usesMarketV2() internal pure override returns (bool) {
        return true;
    }

    function test_reservationProofNeedsSixtyFourAttestedBlocksOnTop() public {
        AttestcoinGate.ProofEnvelope memory proof = reservation(terms);
        NativeMocks.attest(proof.blockHeight + 63, 11155111);
        cheats.prank(BUYER);
        cheats.expectRevert(
            abi.encodeWithSelector(
                AttestcoinGateV2.InsufficientAttestedDepth.selector, proof.blockHeight + 63, proof.blockHeight + 64
            )
        );
        market.fundReservation(proof, 0, terms);
        require(market.totalLiabilities() == 0 && token.balanceOf(address(market)) == 0);
        require(market.getSale(SaleTermsLib.saleId(terms)).state == MarketTypes.State.ABSENT);
        NativeMocks.attest(proof.blockHeight + 64, 11155111);
        bytes32 id = fund();
        require(market.getSale(id).state == MarketTypes.State.BOUND);
    }

    function test_shallowOutcomeProofWaitsAndThenSettles() public {
        bytes32 id = fund();
        AttestcoinGate.ProofEnvelope memory proof = outcome(true);
        NativeMocks.attest(proof.blockHeight + 10, 11155111);
        cheats.expectRevert(
            abi.encodeWithSelector(
                AttestcoinGateV2.InsufficientAttestedDepth.selector, proof.blockHeight + 10, proof.blockHeight + 64
            )
        );
        market.settleAssignment(proof, 0, id);
        require(market.getSale(id).state == MarketTypes.State.BOUND && market.totalCredits() == 0);
        NativeMocks.attest(proof.blockHeight + 100000, 11155111);
        market.settleAssignment(proof, 0, id);
        require(market.getSale(id).state == MarketTypes.State.ASSIGNED_CLAIMABLE);
    }

    function test_missingAttestationFrontierRefusesEveryProof() public {
        AttestcoinGate.ProofEnvelope memory proof = reservation(terms);
        cheats.mockCall(
            NativeMocks.CHAIN_INFO,
            abi.encodeWithSelector(IChainInfo.get_latest_attestation_height_and_hash.selector),
            abi.encode(IChainInfo.AttestationPoint(type(uint64).max - 64, bytes32(0), true, false))
        );
        cheats.prank(BUYER);
        cheats.expectRevert(
            abi.encodeWithSelector(
                AttestcoinGateV2.InsufficientAttestedDepth.selector, type(uint64).max - 64, proof.blockHeight + 64
            )
        );
        market.fundReservation(proof, 0, terms);
    }

    function test_chainKeyMustResolveToSepolia() public {
        AttestcoinGate.ProofEnvelope memory proof = reservation(terms);
        NativeMocks.attest(NativeMocks.ATTESTED_HEIGHT, 1);
        cheats.prank(BUYER);
        cheats.expectRevert(abi.encodeWithSelector(AttestcoinGateV2.UnsupportedSourceChain.selector));
        market.fundReservation(proof, 0, terms);
        cheats.mockCall(
            NativeMocks.CHAIN_INFO,
            abi.encodeWithSelector(IChainInfo.get_chain_by_key.selector),
            abi.encode(IChainInfo.ChainLookup(IChainInfo.ChainDescription(1, 11155111, "", 1), false))
        );
        cheats.prank(BUYER);
        cheats.expectRevert(abi.encodeWithSelector(AttestcoinGateV2.UnsupportedSourceChain.selector));
        market.fundReservation(proof, 0, terms);
        cheats.mockCall(
            NativeMocks.CHAIN_INFO,
            abi.encodeWithSelector(IChainInfo.get_chain_by_key.selector),
            abi.encode(IChainInfo.ChainLookup(IChainInfo.ChainDescription(3, 11155111, "", 1), true))
        );
        cheats.prank(BUYER);
        cheats.expectRevert(abi.encodeWithSelector(AttestcoinGateV2.UnsupportedSourceChain.selector));
        market.fundReservation(proof, 0, terms);
        require(market.totalLiabilities() == 0);
    }

    function test_otherChainKeysAreRefusedBeforeAnyPrecompileRead() public {
        AttestcoinGate.ProofEnvelope memory proof = reservation(terms);
        proof.chainKey = 3;
        cheats.expectCall(NativeMocks.CHAIN_INFO, abi.encodeWithSelector(IChainInfo.get_chain_by_key.selector), 0);
        cheats.prank(BUYER);
        cheats.expectRevert(abi.encodeWithSelector(AttestcoinGateV2.WrongChainKey.selector));
        market.fundReservation(proof, 0, terms);
    }

    function test_proofsAreRecordedThroughVerifyAndEmit() public {
        AttestcoinGate.ProofEnvelope memory proof = reservation(terms);
        cheats.expectCall(NativeMocks.NATIVE, abi.encodePacked(VERIFY), 0);
        cheats.expectCall(
            NativeMocks.NATIVE,
            abi.encodeWithSelector(
                VERIFY_AND_EMIT,
                proof.chainKey,
                proof.blockHeight,
                proof.encodedTransaction,
                proof.merkleProof,
                proof.continuityProof
            ),
            1
        );
        fund();
    }
}
