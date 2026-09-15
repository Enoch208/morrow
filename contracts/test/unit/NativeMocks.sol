// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {INativeQueryVerifier} from "@gluwa/asc-contracts/contracts/write-ability/common/INativeQueryVerifier.sol";
import {IChainInfo} from "../../src/libraries/IChainInfo.sol";

interface VmNativeMocks {
    function mockCall(address, bytes calldata, bytes calldata) external;
}

library NativeMocks {
    VmNativeMocks private constant VM = VmNativeMocks(address(uint160(uint256(keccak256("hevm cheat code")))));
    address internal constant NATIVE = 0x0000000000000000000000000000000000000FD2;
    address internal constant CHAIN_INFO = 0x0000000000000000000000000000000000000fD3;
    uint64 internal constant ATTESTED_HEIGHT = 1_000_000_000;

    function install(bool verified, uint64 txIndex) internal {
        VM.mockCall(
            NATIVE,
            abi.encodePacked(
                bytes4(keccak256("verify(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))"))
            ),
            abi.encode(verified)
        );
        VM.mockCall(
            NATIVE,
            abi.encodePacked(
                bytes4(keccak256("verifyAndEmit(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))"))
            ),
            abi.encode(verified)
        );
        VM.mockCall(NATIVE, abi.encodeWithSelector(INativeQueryVerifier.calculateTxIndex.selector), abi.encode(txIndex));
        attest(ATTESTED_HEIGHT, 11155111);
    }

    function attest(uint64 height, uint64 chainId) internal {
        VM.mockCall(
            CHAIN_INFO,
            abi.encodeWithSelector(IChainInfo.get_chain_by_key.selector),
            abi.encode(IChainInfo.ChainLookup(IChainInfo.ChainDescription(1, chainId, "Sepolia ethereum", 1), true))
        );
        VM.mockCall(
            CHAIN_INFO,
            abi.encodeWithSelector(IChainInfo.get_latest_attestation_height_and_hash.selector),
            abi.encode(IChainInfo.AttestationPoint(height, keccak256(abi.encode(height)), true, true))
        );
    }
}
