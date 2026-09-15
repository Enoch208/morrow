// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MorrowMarket} from "../../src/destination/MorrowMarket.sol";
import {AttestcoinGate} from "../../src/libraries/AttestcoinGate.sol";
import {ProofBindingLib} from "../../src/libraries/ProofBindingLib.sol";
import {RealProofBase} from "./RealProofBase.sol";

contract RealProofFixtureTest is RealProofBase {
    function test_fixturesAreTheExactCalldataTheLiveMarketConsumed() public view {
        Fixture memory r = load("claim-a-reservation");
        require(
            keccak256(abi.encodeWithSelector(MorrowMarket.fundReservation.selector, r.proof, r.logIndex, r.terms))
                == r.consumerCalldataHash,
            "fundReservation calldata"
        );
        Fixture memory a = load("claim-a-assignment");
        require(
            keccak256(abi.encodeWithSelector(MorrowMarket.settleAssignment.selector, a.proof, a.logIndex, a.saleId))
                == a.consumerCalldataHash,
            "settleAssignment calldata"
        );
        Fixture memory c = load("claim-b-cancellation");
        require(
            keccak256(
                    abi.encodeWithSelector(MorrowMarket.recognizeCancellation.selector, c.proof, c.logIndex, c.saleId)
                ) == c.consumerCalldataHash,
            "recognizeCancellation calldata"
        );
    }

    function test_realEventKeyPreimageUsesSepoliaTransactionIndex() public view {
        string[3] memory names = ["claim-a-reservation", "claim-a-assignment", "claim-b-cancellation"];
        for (uint256 i; i < names.length; ++i) {
            Fixture memory f = load(names[i]);
            bytes32 key = keccak256(abi.encode(f.proof.chainKey, f.proof.blockHeight, f.txIndex, f.logIndex));
            require(key == f.eventKey, "eventKey preimage");
        }
    }

    function test_realReservationBindsToLiveEventKey() public {
        Fixture memory f = loadVerified("claim-a-reservation", VERIFY);
        require(harness.reservationV1(f.proof, f.logIndex, f.terms, LIVE_VAULT) == f.eventKey, "eventKey");
    }

    function test_realAssignmentBindsToLiveEventKey() public {
        Fixture memory f = loadVerified("claim-a-assignment", VERIFY);
        require(harness.outcomeV1(f.proof, f.logIndex, f.terms, LIVE_VAULT, true) == f.eventKey, "eventKey");
    }

    function test_realCancellationBindsToLiveEventKey() public {
        Fixture memory f = loadVerified("claim-b-cancellation", VERIFY);
        require(harness.outcomeV1(f.proof, f.logIndex, f.terms, LIVE_VAULT, false) == f.eventKey, "eventKey");
    }

    function test_realReservationOtherLogIndexReverts() public {
        Fixture memory f = loadVerified("claim-a-reservation", VERIFY);
        vm.expectRevert(AttestcoinGate.LogIndexOutOfRange.selector);
        harness.reservationV1(f.proof, f.logIndex + 1, f.terms, LIVE_VAULT);
    }

    function test_realReservationChangedTermsReverts() public {
        Fixture memory f = loadVerified("claim-a-reservation", VERIFY);
        f.terms.grossPurchasePriceRaw += 1;
        vm.expectRevert(ProofBindingLib.SaleIdMismatch.selector);
        harness.reservationV1(f.proof, f.logIndex, f.terms, LIVE_VAULT);
    }

    function test_realAssignmentChangedTermsReverts() public {
        Fixture memory f = loadVerified("claim-a-assignment", VERIFY);
        f.terms.buyer = address(0xBEEF);
        vm.expectRevert(ProofBindingLib.SaleIdMismatch.selector);
        harness.outcomeV1(f.proof, f.logIndex, f.terms, LIVE_VAULT, true);
    }

    function test_realReservationWrongEmitterReverts() public {
        Fixture memory f = loadVerified("claim-a-reservation", VERIFY);
        vm.expectRevert(AttestcoinGate.WrongEmitter.selector);
        harness.reservationV1(f.proof, f.logIndex, f.terms, address(0xBAD));
    }

    function test_realAssignmentPresentedAsCancellationReverts() public {
        Fixture memory f = loadVerified("claim-a-assignment", VERIFY);
        vm.expectRevert(AttestcoinGate.WrongEventSignature.selector);
        harness.outcomeV1(f.proof, f.logIndex, f.terms, LIVE_VAULT, false);
    }

    function test_realReservationTamperedTransactionReverts() public {
        Fixture memory f = loadVerified("claim-a-reservation", VERIFY);
        vm.expectRevert(AttestcoinGate.NativeVerificationFailed.selector);
        harness.reservationV1(withFlippedByte(f.proof), f.logIndex, f.terms, LIVE_VAULT);
    }

    function test_realCancellationTamperedTransactionReverts() public {
        Fixture memory f = loadVerified("claim-b-cancellation", VERIFY);
        vm.expectRevert(AttestcoinGate.NativeVerificationFailed.selector);
        harness.outcomeV1(withFlippedByte(f.proof), f.logIndex, f.terms, LIVE_VAULT, false);
    }
}
