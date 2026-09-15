// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {FundedPaymentVault} from "../../src/source/FundedPaymentVault.sol";
import {MorrowMarket} from "../../src/destination/MorrowMarket.sol";
import {MorrowMarketV2} from "../../src/destination/MorrowMarketV2.sol";
import {MarketTypes} from "../../src/destination/MarketTypes.sol";
import {MorrowTestToken} from "../../src/testnet/MorrowTestToken.sol";
import {SaleTermsLib} from "../../src/libraries/SaleTermsLib.sol";
import {AttestcoinGate} from "../../src/libraries/AttestcoinGate.sol";
import {EvmV1Decoder} from "@gluwa/asc-contracts/contracts/common/EvmV1Decoder.sol";
import {INativeQueryVerifier} from "@gluwa/asc-contracts/contracts/write-ability/common/INativeQueryVerifier.sol";
import {NativeMocks} from "../unit/NativeMocks.sol";

interface VmLifecycle {
    struct Log {
        bytes32[] topics;
        bytes data;
        address emitter;
    }
    function chainId(uint256) external;
    function warp(uint256) external;
    function prank(address) external;
    function expectRevert(bytes4) external;
    function mockCall(address, bytes calldata, bytes calldata) external;
    function recordLogs() external;
    function getRecordedLogs() external returns (Log[] memory);
}

abstract contract LifecycleFixture {
    VmLifecycle internal constant vm = VmLifecycle(address(uint160(uint256(keccak256("hevm cheat code")))));
    address internal constant NATIVE = 0x0000000000000000000000000000000000000FD2;
    address internal constant FEE = address(0x7000);
    FundedPaymentVault internal vault;
    MorrowMarket internal market;
    MorrowTestToken internal source;
    MorrowTestToken internal settlement;
    uint64 internal proofHeight;
    uint256 internal backing;
    uint256 public fundings;
    uint256 public assignments;
    uint256 public cancellations;
    uint256 public repeatedRounds;
    uint256 public redemptions;
    uint256 public withdrawals;
    bytes32[] private consumedKeys;
    bytes32[] private fundedSales;
    mapping(bytes32 => bytes32) private reservationKeys;

    constructor() {
        vm.warp(1000);
        vm.chainId(11155111);
        source = new MorrowTestToken("Invariant source", "ISRC", 6, 1e24);
        vault = new FundedPaymentVault(address(source));
        source.approve(address(vault), type(uint256).max);
        vm.chainId(102031);
        settlement = new MorrowTestToken("Invariant settlement", "ISET", 6, 1e24);
        market = newMarket(address(settlement), address(vault), address(source), FEE, 50);
        for (uint160 i = 0; i < 2; i++) {
            address buyer = address(uint160(0x6000) + i);
            settlement.transfer(buyer, 1e23);
            vm.prank(buyer);
            settlement.approve(address(market), type(uint256).max);
        }
        NativeMocks.install(true, 0);
    }

    function usesMarketV2() internal pure virtual returns (bool) {
        return false;
    }

    function newMarket(
        address settlementToken,
        address sourceVault,
        address sourceToken,
        address feeRecipient,
        uint16 feeBps
    ) internal returns (MorrowMarket) {
        if (usesMarketV2()) {
            return MorrowMarket(
                address(new MorrowMarketV2(settlementToken, sourceVault, sourceToken, feeRecipient, feeBps))
            );
        }
        return new MorrowMarket(settlementToken, sourceVault, sourceToken, feeRecipient, feeBps);
    }

    function assertAccounting() public view {
        require(source.balanceOf(address(vault)) >= backing);
        require(vault.totalBacking() == backing);
        require(settlement.balanceOf(address(market)) >= market.totalLiabilities());
        require(market.totalLiabilities() == market.totalBound() + market.totalCredits());
        uint256 credits = market.credits(FEE);
        for (uint160 i = 0; i < 2; i++) {
            credits += market.credits(address(uint160(0x5000) + i));
            credits += market.credits(address(uint160(0x6000) + i));
        }
        require(credits == market.totalCredits());
    }

    function assertConsumption() public view {
        for (uint256 i = 0; i < consumedKeys.length; i++) {
            require(market.consumed(consumedKeys[i]));
        }
        for (uint256 i = 0; i < fundedSales.length; i++) {
            require(market.getSale(fundedSales[i]).state != MarketTypes.State.ABSENT);
            require(market.consumed(reservationKeys[fundedSales[i]]));
        }
    }

    function consumedKey(AttestcoinGate.ProofEnvelope memory proof) private pure returns (bytes32) {
        return keccak256(abi.encode(proof.chainKey, proof.blockHeight, uint64(0), uint256(0)));
    }

    function markConsumed(AttestcoinGate.ProofEnvelope memory proof) internal {
        consumedKeys.push(consumedKey(proof));
    }

    function capturedProof() internal returns (AttestcoinGate.ProofEnvelope memory proof) {
        VmLifecycle.Log[] memory captured = vm.getRecordedLogs();
        require(captured.length == 1 && captured[0].emitter == address(vault));
        EvmV1Decoder.LogEntry[] memory logs = new EvmV1Decoder.LogEntry[](1);
        logs[0] = EvmV1Decoder.LogEntry(captured[0].emitter, captured[0].topics, captured[0].data);
        bytes[] memory chunks = new bytes[](3);
        chunks[0] = abi.encode(uint64(0), uint64(100000), address(this), false, address(vault), uint256(0), hex"");
        chunks[1] = hex"";
        chunks[2] = abi.encode(uint8(1), uint64(50000), logs, new bytes(256));
        proof.chainKey = 1;
        proof.blockHeight = ++proofHeight;
        proof.encodedTransaction = abi.encode(uint8(2), chunks);
        proof.merkleProof.siblings = new INativeQueryVerifier.MerkleProofEntry[](0);
        proof.continuityProof.roots = new bytes32[](0);
    }

    function fundedRound(SaleTermsLib.Terms memory terms) internal returns (bytes32 id) {
        vm.chainId(11155111);
        vm.recordLogs();
        vm.prank(terms.seller);
        id = vault.reserveSale(terms.claimId, terms);
        AttestcoinGate.ProofEnvelope memory proof = capturedProof();
        vm.chainId(102031);
        vm.prank(terms.buyer);
        require(market.fundReservation(proof, 0, terms) == id);
        fundings++;
        markConsumed(proof);
        fundedSales.push(id);
        reservationKeys[id] = consumedKey(proof);
        vm.prank(terms.buyer);
        vm.expectRevert(MorrowMarket.SaleAlreadyExists.selector);
        market.fundReservation(proof, 0, terms);
        assertAccounting();
    }

    function withdrawCredit(address actor) internal {
        uint256 amount = market.credits(actor);
        if (amount > 0) {
            uint256 beforeBalance = settlement.balanceOf(actor);
            vm.chainId(102031);
            vm.prank(actor);
            market.withdraw();
            require(settlement.balanceOf(actor) == beforeBalance + amount);
            withdrawals++;
            vm.prank(actor);
            vm.expectRevert(MorrowMarket.NoCredit.selector);
            market.withdraw();
        }
        assertAccounting();
    }
}
