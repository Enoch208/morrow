// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LifecycleFixture} from "../invariant/LifecycleFixture.sol";
import {FundedPaymentVault} from "../../src/source/FundedPaymentVault.sol";
import {SaleTermsLib} from "../../src/libraries/SaleTermsLib.sol";
import {AttestcoinGate} from "../../src/libraries/AttestcoinGate.sol";
import {SourceTypes} from "../../src/source/SourceTypes.sol";
import {EvmV1Decoder} from "@gluwa/asc-contracts/contracts/common/EvmV1Decoder.sol";

contract AssignmentBatchSeller {
    function reserve(FundedPaymentVault vault, SaleTermsLib.Terms calldata terms) external {
        vault.reserveSale(terms.claimId, terms);
    }

    function assign(FundedPaymentVault vault, SaleTermsLib.Terms calldata terms, bool duplicate) external {
        vault.assignSale(terms.claimId, terms.round, SaleTermsLib.termsHash(terms));
        if (duplicate) vault.assignSale(terms.claimId, terms.round, SaleTermsLib.termsHash(terms));
    }
}

contract AssignmentUniquenessTest is LifecycleFixture {
    function test_T29_duplicateAssignmentBatchRollsBackAndSingleAssignmentEmitsOnce() public {
        vm.chainId(11155111);
        AssignmentBatchSeller seller = new AssignmentBatchSeller();
        uint256 id = vault.createClaim(address(source), 10000, address(seller), 3000, bytes32(0));
        backing = 10000;
        SaleTermsLib.Terms memory terms = SaleTermsLib.Terms(
            1,
            11155111,
            address(vault),
            id,
            1,
            102031,
            address(market),
            address(seller),
            address(0x6000),
            address(source),
            10000,
            3000,
            address(settlement),
            9410,
            50,
            FEE,
            1800,
            2000
        );
        vm.recordLogs();
        seller.reserve(vault, terms);
        AttestcoinGate.ProofEnvelope memory reserved = capturedProof();
        vm.chainId(102031);
        vm.prank(terms.buyer);
        bytes32 saleId = market.fundReservation(reserved, 0, terms);
        vm.chainId(11155111);
        bytes32 beforeState = snapshot(terms, saleId);
        vm.expectRevert(FundedPaymentVault.RoundMismatch.selector);
        seller.assign(vault, terms, true);
        require(snapshot(terms, saleId) == beforeState);
        require(vault.getRound(id, 1).state == SourceTypes.RoundState.RESERVED);
        vm.recordLogs();
        seller.assign(vault, terms, false);
        AttestcoinGate.ProofEnvelope memory assigned = capturedProof();
        assertAssignmentEvent(assigned, terms);
        require(assigned.blockHeight == reserved.blockHeight + 1);
        require(vault.getClaim(id).currentBeneficiary == terms.buyer);
        require(vault.getRound(id, 1).state == SourceTypes.RoundState.ASSIGNED);
        require(market.totalBound() == 9410 && market.totalCredits() == 0);
        beforeState = snapshot(terms, saleId);
        vm.expectRevert(FundedPaymentVault.RoundMismatch.selector);
        seller.assign(vault, terms, true);
        require(snapshot(terms, saleId) == beforeState);
        assertAccounting();
    }

    function assertAssignmentEvent(AttestcoinGate.ProofEnvelope memory proof, SaleTermsLib.Terms memory terms)
        private
        pure
    {
        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(proof.encodedTransaction);
        require(receipt.receiptStatus == 1 && receipt.receiptLogs.length == 1);
        EvmV1Decoder.LogEntry memory entry = receipt.receiptLogs[0];
        require(entry.address_ == terms.sourceVault && entry.topics.length == 4);
        require(entry.topics[0] == keccak256("SaleAssigned(bytes32,uint256,uint256,bytes32)"));
        require(entry.topics[1] == SaleTermsLib.saleId(terms));
        require(entry.topics[2] == bytes32(terms.claimId) && entry.topics[3] == bytes32(terms.round));
        require(keccak256(entry.data) == keccak256(abi.encode(SaleTermsLib.termsHash(terms))));
    }

    function snapshot(SaleTermsLib.Terms memory terms, bytes32 id) private view returns (bytes32) {
        bytes32 sourceState = keccak256(
            abi.encode(
                vault.getClaim(terms.claimId),
                vault.getRound(terms.claimId, 1),
                vault.totalBacking(),
                vault.nextClaimId(),
                source.totalSupply(),
                source.balanceOf(address(vault)),
                source.balanceOf(address(this)),
                source.balanceOf(terms.seller),
                source.balanceOf(terms.buyer)
            )
        );
        bytes32 funds = keccak256(
            abi.encode(
                market.getSale(id),
                market.totalBound(),
                market.totalLiabilities(),
                market.totalCredits(),
                market.credits(terms.seller),
                market.credits(terms.buyer),
                market.credits(FEE)
            )
        );
        bytes32 balances = keccak256(
            abi.encode(
                settlement.balanceOf(address(market)),
                settlement.balanceOf(terms.buyer),
                settlement.balanceOf(terms.seller),
                settlement.balanceOf(FEE),
                settlement.allowance(terms.buyer, address(market))
            )
        );
        bytes32 consumption;
        for (uint64 height = 1; height <= proofHeight; height++) {
            consumption = keccak256(
                abi.encode(
                    consumption, market.consumed(keccak256(abi.encode(uint64(1), height, uint64(0), uint256(0))))
                )
            );
        }
        return keccak256(abi.encode(sourceState, funds, balances, consumption));
    }
}
