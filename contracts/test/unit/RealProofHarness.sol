// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AttestcoinGate} from "../../src/libraries/AttestcoinGate.sol";
import {ProofBindingLib} from "../../src/libraries/ProofBindingLib.sol";
import {ProofBindingLibV2} from "../../src/libraries/ProofBindingLibV2.sol";
import {SaleTermsLib} from "../../src/libraries/SaleTermsLib.sol";

contract RealProofHarness {
    function reservationV1(
        AttestcoinGate.ProofEnvelope calldata proof,
        uint256 logIndex,
        SaleTermsLib.Terms memory terms,
        address sourceVault
    ) external view returns (bytes32) {
        return ProofBindingLib.reservation(proof, logIndex, terms, sourceVault);
    }

    function outcomeV1(
        AttestcoinGate.ProofEnvelope calldata proof,
        uint256 logIndex,
        SaleTermsLib.Terms memory terms,
        address sourceVault,
        bool assigned
    ) external view returns (bytes32) {
        return ProofBindingLib.outcome(proof, logIndex, terms, sourceVault, assigned);
    }

    function reservationV2(
        AttestcoinGate.ProofEnvelope calldata proof,
        uint256 logIndex,
        SaleTermsLib.Terms memory terms,
        address sourceVault
    ) external returns (bytes32) {
        return ProofBindingLibV2.reservation(proof, logIndex, terms, sourceVault);
    }

    function outcomeV2(
        AttestcoinGate.ProofEnvelope calldata proof,
        uint256 logIndex,
        SaleTermsLib.Terms memory terms,
        address sourceVault,
        bool assigned
    ) external returns (bytes32) {
        return ProofBindingLibV2.outcome(proof, logIndex, terms, sourceVault, assigned);
    }
}
