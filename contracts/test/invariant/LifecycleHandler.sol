// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LifecycleFixture} from "./LifecycleFixture.sol";
import {FundedPaymentVault} from "../../src/source/FundedPaymentVault.sol";
import {SaleTermsLib} from "../../src/libraries/SaleTermsLib.sol";
import {AttestcoinGate} from "../../src/libraries/AttestcoinGate.sol";
import {ProofBindingLib} from "../../src/libraries/ProofBindingLib.sol";
import {SourceTypes} from "../../src/source/SourceTypes.sol";

contract LifecycleHandler is LifecycleFixture {
    function cycle(bool assigned, uint64 seed) external {
        uint256 price = uint256(seed) % 100000 + 200;
        uint160 actor = uint160(seed % 2);
        vm.chainId(11155111);
        uint256 maturity = block.timestamp + 1000;
        uint256 id =
            vault.createClaim(address(source), price + 100, address(uint160(0x5000) + actor), maturity, bytes32(0));
        backing += price + 100;
        SaleTermsLib.Terms memory terms = SaleTermsLib.Terms(
            1,
            11155111,
            address(vault),
            id,
            1,
            102031,
            address(market),
            address(uint160(0x5000) + actor),
            address(uint160(0x6000) + actor),
            address(source),
            price + 100,
            maturity,
            address(settlement),
            price,
            50,
            FEE,
            block.timestamp + 50,
            block.timestamp + 100
        );
        bytes32 first = fundedRound(terms);
        AttestcoinGate.ProofEnvelope memory old = cancel(terms);
        vm.chainId(102031);
        market.recognizeCancellation(old, 0, first);
        markConsumed(old);
        require(market.credits(terms.buyer) == price);
        withdrawCredit(terms.buyer);
        terms.round = 2;
        terms.fundBefore = terms.assignBefore + 50;
        terms.assignBefore += 100;
        bytes32 second = fundedRound(terms);
        require(second != first);
        repeatedRounds++;
        vm.expectRevert(ProofBindingLib.SaleIdMismatch.selector);
        market.recognizeCancellation(old, 0, second);
        AttestcoinGate.ProofEnvelope memory proof = assigned ? assign(terms) : cancel(terms);
        bool redeemFirst = seed & 2 != 0;
        if (redeemFirst) redeem(terms, assigned);
        vm.chainId(102031);
        if (assigned) {
            market.settleAssignment(proof, 0, second);
            markConsumed(proof);
            uint256 fee = price * 50 / 10000;
            require(market.credits(terms.seller) == price - fee && market.credits(FEE) == fee);
            require(market.credits(terms.buyer) == 0);
        } else {
            market.recognizeCancellation(proof, 0, second);
            markConsumed(proof);
            require(market.credits(terms.buyer) == price);
            require(market.credits(terms.seller) == 0 && market.credits(FEE) == 0);
        }
        assertAccounting();
        if (seed & 4 != 0) withdrawCredit(FEE);
        withdrawCredit(terms.seller);
        withdrawCredit(terms.buyer);
        withdrawCredit(FEE);
        if (!redeemFirst) redeem(terms, assigned);
        require(vault.getRound(id, 1).state == SourceTypes.RoundState.CANCELLED);
        require(
            vault.getRound(id, 2).state
                == (assigned ? SourceTypes.RoundState.ASSIGNED : SourceTypes.RoundState.CANCELLED)
        );
        require(market.totalLiabilities() == 0 && backing == 0);
        assertAccounting();
    }

    function cancel(SaleTermsLib.Terms memory terms) private returns (AttestcoinGate.ProofEnvelope memory proof) {
        vm.chainId(11155111);
        vm.warp(terms.assignBefore);
        vm.recordLogs();
        vault.cancelExpiredSale(terms.claimId, terms.round);
        proof = capturedProof();
        cancellations++;
        vm.prank(terms.seller);
        vm.expectRevert(FundedPaymentVault.RoundMismatch.selector);
        vault.assignSale(terms.claimId, terms.round, SaleTermsLib.termsHash(terms));
        assertAccounting();
    }

    function assign(SaleTermsLib.Terms memory terms) private returns (AttestcoinGate.ProofEnvelope memory proof) {
        vm.chainId(11155111);
        vm.recordLogs();
        vm.prank(terms.seller);
        vault.assignSale(terms.claimId, terms.round, SaleTermsLib.termsHash(terms));
        proof = capturedProof();
        assignments++;
        vm.expectRevert(FundedPaymentVault.RoundMismatch.selector);
        vault.cancelExpiredSale(terms.claimId, terms.round);
        assertAccounting();
    }

    function redeem(SaleTermsLib.Terms memory terms, bool assigned) private {
        vm.chainId(11155111);
        vm.warp(terms.maturity);
        address beneficiary = assigned ? terms.buyer : terms.seller;
        require(vault.getClaim(terms.claimId).currentBeneficiary == beneficiary);
        uint256 beforeBalance = source.balanceOf(beneficiary);
        vault.redeem(terms.claimId);
        backing -= terms.sourceFaceValueRaw;
        require(source.balanceOf(beneficiary) == beforeBalance + terms.sourceFaceValueRaw);
        redemptions++;
        vm.expectRevert(FundedPaymentVault.NotRedeemable.selector);
        vault.redeem(terms.claimId);
        assertAccounting();
    }
}
