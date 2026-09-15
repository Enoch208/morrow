// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AttestcoinGateV2} from "../../src/libraries/AttestcoinGateV2.sol";
import {ProofBindingLibV2} from "../../src/libraries/ProofBindingLibV2.sol";
import {IChainInfo} from "../../src/libraries/IChainInfo.sol";
import {RealProofBase} from "./RealProofBase.sol";

contract RealProofFixtureV2Test is RealProofBase {
    address internal constant CHAIN_INFO = 0x0000000000000000000000000000000000000fD3;
    bytes internal constant LIVE_SEPOLIA_CHAIN_LOOKUP =
        hex"00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000aa36a70000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000105365706f6c696120657468657265756d00000000000000000000000000000000";

    function setUp() public override {
        super.setUp();
        vm.mockCall(CHAIN_INFO, abi.encodeCall(IChainInfo.get_chain_by_key, (1)), LIVE_SEPOLIA_CHAIN_LOOKUP);
    }

    function attestedTo(uint64 height) internal {
        vm.mockCall(
            CHAIN_INFO,
            abi.encodeCall(IChainInfo.get_latest_attestation_height_and_hash, (1)),
            abi.encode(IChainInfo.AttestationPoint(height, keccak256("attestation"), true, true))
        );
    }

    function loadDeep(string memory name) internal returns (Fixture memory f) {
        f = loadVerified(name, VERIFY_AND_EMIT);
        attestedTo(f.proof.blockHeight + 64);
    }

    function test_capturedChainLookupBytesDecodeAsSepolia() public view {
        IChainInfo.ChainLookup memory lookup = IChainInfo(CHAIN_INFO).get_chain_by_key(1);
        require(lookup.exists && lookup.info.chainKey == 1 && lookup.info.chainId == 11155111, "captured lookup");
    }

    function test_realReservationBindsToLiveEventKeyAtDepth64() public {
        Fixture memory f = loadDeep("claim-a-reservation");
        require(harness.reservationV2(f.proof, f.logIndex, f.terms, LIVE_VAULT) == f.eventKey, "eventKey");
    }

    function test_realAssignmentBindsToLiveEventKey() public {
        Fixture memory f = loadDeep("claim-a-assignment");
        require(harness.outcomeV2(f.proof, f.logIndex, f.terms, LIVE_VAULT, true) == f.eventKey, "eventKey");
    }

    function test_realCancellationBindsToLiveEventKey() public {
        Fixture memory f = loadDeep("claim-b-cancellation");
        require(harness.outcomeV2(f.proof, f.logIndex, f.terms, LIVE_VAULT, false) == f.eventKey, "eventKey");
    }

    function test_realReservationAtDepth63Reverts() public {
        Fixture memory f = loadDeep("claim-a-reservation");
        uint64 height = f.proof.blockHeight;
        attestedTo(height + 63);
        vm.expectRevert(
            abi.encodeWithSelector(AttestcoinGateV2.InsufficientAttestedDepth.selector, height + 63, height + 64)
        );
        harness.reservationV2(f.proof, f.logIndex, f.terms, LIVE_VAULT);
    }

    function test_realAssignmentAtDepth63Reverts() public {
        Fixture memory f = loadDeep("claim-a-assignment");
        uint64 height = f.proof.blockHeight;
        attestedTo(height + 63);
        vm.expectRevert(
            abi.encodeWithSelector(AttestcoinGateV2.InsufficientAttestedDepth.selector, height + 63, height + 64)
        );
        harness.outcomeV2(f.proof, f.logIndex, f.terms, LIVE_VAULT, true);
    }

    function test_realReservationOnOtherChainIdReverts() public {
        Fixture memory f = loadDeep("claim-a-reservation");
        IChainInfo.ChainLookup memory mainnet =
            IChainInfo.ChainLookup(IChainInfo.ChainDescription(1, 1, bytes("Ethereum"), 1), true);
        vm.mockCall(CHAIN_INFO, abi.encodeCall(IChainInfo.get_chain_by_key, (1)), abi.encode(mainnet));
        vm.expectRevert(AttestcoinGateV2.UnsupportedSourceChain.selector);
        harness.reservationV2(f.proof, f.logIndex, f.terms, LIVE_VAULT);
    }

    function test_realReservationOtherLogIndexReverts() public {
        Fixture memory f = loadDeep("claim-a-reservation");
        vm.expectRevert(AttestcoinGateV2.LogIndexOutOfRange.selector);
        harness.reservationV2(f.proof, f.logIndex + 1, f.terms, LIVE_VAULT);
    }

    function test_realReservationChangedTermsReverts() public {
        Fixture memory f = loadDeep("claim-a-reservation");
        f.terms.assignBefore += 1;
        vm.expectRevert(ProofBindingLibV2.SaleIdMismatch.selector);
        harness.reservationV2(f.proof, f.logIndex, f.terms, LIVE_VAULT);
    }

    function test_realCancellationChangedTermsReverts() public {
        Fixture memory f = loadDeep("claim-b-cancellation");
        f.terms.feeBps = 49;
        vm.expectRevert(ProofBindingLibV2.SaleIdMismatch.selector);
        harness.outcomeV2(f.proof, f.logIndex, f.terms, LIVE_VAULT, false);
    }

    function test_realAssignmentWrongEmitterReverts() public {
        Fixture memory f = loadDeep("claim-a-assignment");
        vm.expectRevert(AttestcoinGateV2.WrongEmitter.selector);
        harness.outcomeV2(f.proof, f.logIndex, f.terms, address(0xBAD), true);
    }

    function test_realReservationTamperedTransactionReverts() public {
        Fixture memory f = loadDeep("claim-a-reservation");
        vm.expectRevert(AttestcoinGateV2.NativeVerificationFailed.selector);
        harness.reservationV2(withFlippedByte(f.proof), f.logIndex, f.terms, LIVE_VAULT);
    }

    function test_realAssignmentTamperedTransactionReverts() public {
        Fixture memory f = loadDeep("claim-a-assignment");
        vm.expectRevert(AttestcoinGateV2.NativeVerificationFailed.selector);
        harness.outcomeV2(withFlippedByte(f.proof), f.logIndex, f.terms, LIVE_VAULT, true);
    }
}
