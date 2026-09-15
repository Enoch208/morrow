// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MorrowMarket} from "../../src/destination/MorrowMarket.sol";
import {MorrowMarketV2} from "../../src/destination/MorrowMarketV2.sol";
import {MorrowTestToken} from "../../src/testnet/MorrowTestToken.sol";
import {SaleTermsLib} from "../../src/libraries/SaleTermsLib.sol";
import {AttestcoinGate} from "../../src/libraries/AttestcoinGate.sol";
import {INativeQueryVerifier} from "@gluwa/asc-contracts/contracts/write-ability/common/INativeQueryVerifier.sol";
import {EvmV1Decoder} from "@gluwa/asc-contracts/contracts/common/EvmV1Decoder.sol";
import {NativeMocks} from "./NativeMocks.sol";

interface VmMarket {
    function chainId(uint256) external;
    function warp(uint256) external;
    function prank(address) external;
    function expectRevert(bytes4) external;
    function mockCall(address, bytes calldata, bytes calldata) external;
    function clearMockedCalls() external;
}

abstract contract MarketFixture {
    VmMarket internal constant vm = VmMarket(address(uint160(uint256(keccak256("hevm cheat code")))));
    address internal constant NATIVE = 0x0000000000000000000000000000000000000FD2;
    address internal constant VAULT = address(0x1001);
    address internal constant SOURCE_TOKEN = address(0x1002);
    address internal constant SELLER = address(0x1003);
    address internal constant BUYER = address(0x1004);
    address internal constant FEE_RECIPIENT = address(0x1005);
    MorrowMarket internal market;
    MorrowTestToken internal token;
    SaleTermsLib.Terms internal terms;

    function setUp() public virtual {
        vm.chainId(102031);
        vm.warp(1000);
        token = new MorrowTestToken("Local settlement test", "LOCAL", 6, 1000000);
        market = newMarket(address(token), VAULT, SOURCE_TOKEN, FEE_RECIPIENT, 50);
        token.transfer(BUYER, 1000000);
        vm.prank(BUYER);
        token.approve(address(market), type(uint256).max);
        terms = SaleTermsLib.Terms(
            1,
            11155111,
            VAULT,
            1,
            1,
            102031,
            address(market),
            SELLER,
            BUYER,
            SOURCE_TOKEN,
            10000,
            3000,
            address(token),
            9410,
            50,
            FEE_RECIPIENT,
            1800,
            2000
        );
        NativeMocks.install(true, 7);
    }

    function usesMarketV2() internal pure virtual returns (bool) {
        return false;
    }

    function newMarket(address settlement, address vault, address sourceToken, address feeRecipient, uint16 feeBps)
        internal
        returns (MorrowMarket)
    {
        if (usesMarketV2()) {
            return MorrowMarket(address(new MorrowMarketV2(settlement, vault, sourceToken, feeRecipient, feeBps)));
        }
        return new MorrowMarket(settlement, vault, sourceToken, feeRecipient, feeBps);
    }

    function reservation(SaleTermsLib.Terms memory supplied)
        internal
        pure
        returns (AttestcoinGate.ProofEnvelope memory)
    {
        return eventProof(
            supplied,
            keccak256("SaleReserved(bytes32,uint256,uint256,bytes32,bytes)"),
            abi.encode(SaleTermsLib.termsHash(supplied), abi.encode(supplied)),
            99
        );
    }

    function outcome(bool assigned) internal view returns (AttestcoinGate.ProofEnvelope memory) {
        bytes32 signature = assigned
            ? keccak256("SaleAssigned(bytes32,uint256,uint256,bytes32)")
            : keccak256("SaleCancelled(bytes32,uint256,uint256,bytes32)");
        return eventProof(terms, signature, abi.encode(SaleTermsLib.termsHash(terms)), 100);
    }

    function eventProof(SaleTermsLib.Terms memory supplied, bytes32 signature, bytes memory data, uint64 height)
        internal
        pure
        returns (AttestcoinGate.ProofEnvelope memory proof)
    {
        bytes32[] memory topics = new bytes32[](4);
        topics[0] = signature;
        topics[1] = SaleTermsLib.saleId(supplied);
        topics[2] = bytes32(supplied.claimId);
        topics[3] = bytes32(supplied.round);
        EvmV1Decoder.LogEntry[] memory logs = new EvmV1Decoder.LogEntry[](1);
        logs[0] = EvmV1Decoder.LogEntry(supplied.sourceVault, topics, data);
        bytes[] memory chunks = new bytes[](3);
        chunks[0] = abi.encode(uint64(0), uint64(100000), SELLER, false, supplied.sourceVault, uint256(0), hex"");
        chunks[1] = hex"";
        chunks[2] = abi.encode(uint8(1), uint64(50000), logs, new bytes(256));
        proof.chainKey = 1;
        proof.blockHeight = height;
        proof.encodedTransaction = abi.encode(uint8(2), chunks);
        proof.merkleProof.siblings = new INativeQueryVerifier.MerkleProofEntry[](0);
        proof.continuityProof.roots = new bytes32[](0);
    }

    function fund() internal returns (bytes32 id) {
        vm.prank(BUYER);
        id = market.fundReservation(reservation(terms), 0, terms);
    }

    function solvent() internal view {
        require(token.balanceOf(address(market)) >= market.totalLiabilities());
        require(market.totalLiabilities() == market.totalBound() + market.totalCredits());
    }
}
