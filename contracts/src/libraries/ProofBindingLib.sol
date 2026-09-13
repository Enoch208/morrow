// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {EvmV1Decoder} from "@gluwa/asc-contracts/contracts/common/EvmV1Decoder.sol";
import {AttestcoinGate} from "./AttestcoinGate.sol";
import {SaleTermsLib} from "./SaleTermsLib.sol";

library ProofBindingLib {
    bytes32 internal constant RESERVED = keccak256("SaleReserved(bytes32,uint256,uint256,bytes32,bytes)");
    bytes32 internal constant ASSIGNED = keccak256("SaleAssigned(bytes32,uint256,uint256,bytes32)");
    bytes32 internal constant CANCELLED = keccak256("SaleCancelled(bytes32,uint256,uint256,bytes32)");

    error InvalidEventLayout();
    error SaleIdMismatch();
    error ClaimRoundMismatch();
    error TermsHashMismatch();

    function reservation(
        AttestcoinGate.ProofEnvelope calldata proof,
        uint256 logIndex,
        SaleTermsLib.Terms memory terms,
        address sourceVault
    ) internal view returns (bytes32 eventKey) {
        EvmV1Decoder.LogEntry memory entry;
        (entry, eventKey) = AttestcoinGate.authenticate(proof, logIndex, 1, sourceVault, RESERVED);
        bindIdentity(entry, terms);
        if (entry.data.length != 672) revert InvalidEventLayout();
        if (keccak256(entry.data) != keccak256(abi.encode(SaleTermsLib.termsHash(terms), abi.encode(terms)))) {
            revert TermsHashMismatch();
        }
    }

    function outcome(
        AttestcoinGate.ProofEnvelope calldata proof,
        uint256 logIndex,
        SaleTermsLib.Terms memory terms,
        address sourceVault,
        bool assigned
    ) internal view returns (bytes32 eventKey) {
        EvmV1Decoder.LogEntry memory entry;
        (entry, eventKey) =
            AttestcoinGate.authenticate(proof, logIndex, 1, sourceVault, assigned ? ASSIGNED : CANCELLED);
        bindIdentity(entry, terms);
        if (entry.data.length != 32) revert InvalidEventLayout();
        if (abi.decode(entry.data, (bytes32)) != SaleTermsLib.termsHash(terms)) revert TermsHashMismatch();
    }

    function bindIdentity(EvmV1Decoder.LogEntry memory entry, SaleTermsLib.Terms memory terms) private pure {
        if (entry.topics.length != 4) revert InvalidEventLayout();
        if (entry.topics[1] != SaleTermsLib.saleId(terms)) revert SaleIdMismatch();
        if (entry.topics[2] != bytes32(terms.claimId) || entry.topics[3] != bytes32(terms.round)) {
            revert ClaimRoundMismatch();
        }
    }
}
