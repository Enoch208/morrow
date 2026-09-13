// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MarketFixture} from "./MarketFixture.sol";
import {MorrowMarket} from "../../src/destination/MorrowMarket.sol";
import {MarketTypes} from "../../src/destination/MarketTypes.sol";
import {SaleTermsLib} from "../../src/libraries/SaleTermsLib.sol";
import {AttestcoinGate} from "../../src/libraries/AttestcoinGate.sol";
import {EvmV1Decoder} from "@gluwa/asc-contracts/contracts/common/EvmV1Decoder.sol";

abstract contract ProofBoundaryFixture is MarketFixture {
    function replaceLog(AttestcoinGate.ProofEnvelope memory original, bytes memory data, uint256 topicCount)
        internal
        pure
        returns (AttestcoinGate.ProofEnvelope memory changed)
    {
        changed = abi.decode(abi.encode(original), (AttestcoinGate.ProofEnvelope));
        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(changed.encodedTransaction);
        bytes32[] memory topics = new bytes32[](topicCount);
        for (uint256 i; i < topicCount && i < receipt.receiptLogs[0].topics.length; i++) {
            topics[i] = receipt.receiptLogs[0].topics[i];
        }
        receipt.receiptLogs[0].topics = topics;
        receipt.receiptLogs[0].data = data;
        (uint8 kind, bytes[] memory chunks) = abi.decode(changed.encodedTransaction, (uint8, bytes[]));
        chunks[2] =
            abi.encode(receipt.receiptStatus, receipt.receiptGasUsed, receipt.receiptLogs, receipt.receiptLogsBloom);
        changed.encodedTransaction = abi.encode(kind, chunks);
    }

    function rejectUnchanged(bytes memory callData, bytes4 errorSelector, SaleTermsLib.Terms memory candidate)
        internal
    {
        bytes32 beforeState = snapshot(candidate);
        vm.prank(BUYER);
        (bool success, bytes memory reason) = address(market).call(callData);
        require(!success && keccak256(reason) == keccak256(abi.encodeWithSelector(errorSelector)));
        require(snapshot(candidate) == beforeState);
        solvent();
    }

    function snapshot(SaleTermsLib.Terms memory candidate) private view returns (bytes32) {
        bytes32 custody = keccak256(
            abi.encode(
                market.getSale(SaleTermsLib.saleId(terms)),
                market.getSale(SaleTermsLib.saleId(candidate)),
                market.totalBound(),
                market.totalLiabilities(),
                market.totalCredits(),
                market.credits(BUYER),
                market.credits(SELLER),
                market.credits(FEE_RECIPIENT),
                market.consumed(eventKey(99)),
                market.consumed(eventKey(100))
            )
        );
        bytes32 balances = keccak256(
            abi.encode(
                token.balanceOf(BUYER),
                token.balanceOf(address(market)),
                token.balanceOf(SELLER),
                token.balanceOf(FEE_RECIPIENT),
                token.balanceOf(address(this)),
                token.allowance(BUYER, address(market)),
                token.totalSupply()
            )
        );
        return keccak256(abi.encode(custody, balances));
    }

    function fundOriginal(AttestcoinGate.ProofEnvelope memory original) internal returns (bytes32 id) {
        require(!market.consumed(eventKey(99)));
        uint256 beforeBuyer = token.balanceOf(BUYER);
        vm.prank(BUYER);
        id = market.fundReservation(original, 0, terms);
        require(market.getSale(id).state == MarketTypes.State.BOUND);
        require(keccak256(abi.encode(market.getSale(id).terms)) == keccak256(abi.encode(terms)));
        require(market.totalBound() == terms.grossPurchasePriceRaw);
        require(market.totalLiabilities() == terms.grossPurchasePriceRaw && market.totalCredits() == 0);
        require(token.balanceOf(BUYER) == beforeBuyer - terms.grossPurchasePriceRaw);
        require(token.balanceOf(address(market)) == terms.grossPurchasePriceRaw);
        require(market.consumed(eventKey(99)) && !market.consumed(eventKey(100)));
        solvent();
    }

    function terminalCall(AttestcoinGate.ProofEnvelope memory proof, bytes32 id, bool assigned)
        internal
        pure
        returns (bytes memory)
    {
        return assigned
            ? abi.encodeCall(MorrowMarket.settleAssignment, (proof, 0, id))
            : abi.encodeCall(MorrowMarket.recognizeCancellation, (proof, 0, id));
    }

    function eventKey(uint64 height) internal pure returns (bytes32) {
        return keccak256(abi.encode(uint64(1), height, uint64(7), uint256(0)));
    }
}
