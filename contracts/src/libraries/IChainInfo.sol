// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IChainInfo {
    struct ChainDescription {
        uint64 chainKey;
        uint64 chainId;
        bytes chainName;
        uint8 chainEncoding;
    }

    struct ChainLookup {
        ChainDescription info;
        bool exists;
    }

    struct AttestationPoint {
        uint64 height;
        bytes32 hash;
        bool isAttestation;
        bool exists;
    }

    function get_chain_by_key(uint64 chainKey) external view returns (ChainLookup memory result);

    function get_latest_attestation_height_and_hash(uint64 chainKey)
        external
        view
        returns (AttestationPoint memory result);
}
