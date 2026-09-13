// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MarketFixture} from "./MarketFixture.sol";
import {MorrowMarket} from "../../src/destination/MorrowMarket.sol";
import {MarketTerms} from "../../src/destination/MarketTerms.sol";
import {MarketTypes} from "../../src/destination/MarketTypes.sol";
import {ProofBindingLib} from "../../src/libraries/ProofBindingLib.sol";
import {SaleTermsLib} from "../../src/libraries/SaleTermsLib.sol";
import {AttestcoinGate} from "../../src/libraries/AttestcoinGate.sol";

contract MarketRejectionsTest is MarketFixture {
    function test_T32_authenticOtherDestinationCannotFundHere() public {
        terms.destinationMarket = address(0xBAD);
        vm.prank(BUYER);
        vm.expectRevert(MarketTerms.WrongDeploymentDomain.selector);
        market.fundReservation(reservation(terms), 0, terms);
        terms.destinationMarket = address(market);
        terms.destinationEvmChainId = 1;
        vm.prank(BUYER);
        vm.expectRevert(MarketTerms.WrongDeploymentDomain.selector);
        market.fundReservation(reservation(terms), 0, terms);
        require(market.totalLiabilities() == 0);
    }

    function test_T42_oldCancellationCannotSettleNewRound() public {
        bytes32 oldId = fund();
        AttestcoinGate.ProofEnvelope memory oldCancellation = outcome(false);
        market.recognizeCancellation(oldCancellation, 0, oldId);
        terms.round = 2;
        AttestcoinGate.ProofEnvelope memory newReservation = reservation(terms);
        newReservation.blockHeight = 101;
        vm.prank(BUYER);
        bytes32 newId = market.fundReservation(newReservation, 0, terms);
        vm.expectRevert(ProofBindingLib.SaleIdMismatch.selector);
        market.recognizeCancellation(oldCancellation, 0, newId);
        require(market.getSale(newId).state == MarketTypes.State.BOUND);
        require(market.totalBound() == 9410 && market.credits(BUYER) == 9410);
        solvent();
    }

    function test_T43_T44_terminalProofBeforeFundingCanRetryAfterHistoricalFunding() public {
        AttestcoinGate.ProofEnvelope memory cancellation = outcome(false);
        bytes32 id = SaleTermsLib.saleId(terms);
        vm.expectRevert(MorrowMarket.SaleNotBound.selector);
        market.recognizeCancellation(cancellation, 0, id);
        fund();
        market.recognizeCancellation(cancellation, 0, id);
        require(market.credits(BUYER) == 9410);
        solvent();
    }

    function test_T41_elapsedTimeExposesNoRefundOrAdminExit() public {
        bytes32 id = fund();
        vm.warp(100000);
        (bool refunded,) = address(market).call(abi.encodeWithSignature("refundAfterTimeout(bytes32)", id));
        (bool resolved,) = address(market).call(abi.encodeWithSignature("adminResolve(bytes32)", id));
        require(!refunded && !resolved);
        require(market.getSale(id).state == MarketTypes.State.BOUND && market.credits(BUYER) == 0);
        solvent();
    }

    function test_T45_sameSourceEventCannotUseAnotherProofNamespace() public {
        fund();
        terms.round++;
        vm.prank(BUYER);
        vm.expectRevert(MorrowMarket.EventAlreadyConsumed.selector);
        market.fundReservation(reservation(terms), 0, terms);
        require(market.totalBound() == 9410);
        solvent();
    }

    function test_T51_overlappingFeeSellerRolesAggregateOnce() public {
        terms.seller = FEE_RECIPIENT;
        bytes32 id = fund();
        market.settleAssignment(outcome(true), 0, id);
        require(market.credits(FEE_RECIPIENT) == 9410 && market.totalCredits() == 9410);
        vm.prank(FEE_RECIPIENT);
        market.withdraw();
        require(token.balanceOf(FEE_RECIPIENT) == 9410);
        solvent();
    }

    function test_T26_noncanonicalReservationEncodingRejected() public {
        bytes memory data = bytes.concat(abi.encode(SaleTermsLib.termsHash(terms), abi.encode(terms)), bytes32(0));
        AttestcoinGate.ProofEnvelope memory proof =
            eventProof(terms, keccak256("SaleReserved(bytes32,uint256,uint256,bytes32,bytes)"), data, 99);
        vm.prank(BUYER);
        vm.expectRevert(ProofBindingLib.InvalidEventLayout.selector);
        market.fundReservation(proof, 0, terms);
        fund();
        solvent();
    }

    function testFuzz_T51_feeRoundingAndWithdrawalConservePrincipal(uint64 rawPrice) public {
        terms.grossPurchasePriceRaw = uint256(rawPrice) % 1000000 + 1;
        bytes32 id = fund();
        market.settleAssignment(outcome(true), 0, id);
        uint256 price = terms.grossPurchasePriceRaw;
        require(market.credits(FEE_RECIPIENT) == price / 200);
        require(market.credits(SELLER) + market.credits(FEE_RECIPIENT) == price);
        vm.prank(SELLER);
        market.withdraw();
        solvent();
    }
}
