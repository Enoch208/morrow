// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MarketFixture} from "./MarketFixture.sol";
import {MorrowMarket} from "../../src/destination/MorrowMarket.sol";
import {MarketTypes} from "../../src/destination/MarketTypes.sol";
import {SaleTermsLib} from "../../src/libraries/SaleTermsLib.sol";
import {AttestcoinGate} from "../../src/libraries/AttestcoinGate.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

contract FundingRollbackTest is MarketFixture {
    bytes32 private assignedId;
    bytes32 private boundId;

    struct Snapshot {
        MarketTypes.Sale target;
        MarketTypes.Sale assigned;
        MarketTypes.Sale bound;
        uint256[5] balances;
        uint256 allowance;
        uint256 supply;
        uint256[6] accounting;
        bool[4] consumed;
    }

    function test_T20_fundingStoresEveryCanonicalTermAndExactBalanceDelta() public {
        approve(terms.grossPurchasePriceRaw);
        assertExactFunding(fundingCall());
    }

    function test_T34_insufficientAllowanceRollsBackCompleteStateThenExactRetry() public {
        seedOtherSales();
        uint256 price = terms.grossPurchasePriceRaw;
        approve(price - 1);
        bytes memory data = fundingCall();
        Snapshot memory beforeState = snapshot();
        rejectUnchanged(
            data,
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(market), price - 1, price),
            beforeState
        );
        approve(price);
        assertExactFunding(data);
    }

    function test_T34_insufficientBalanceRollsBackAllowanceAndStateThenExactRetry() public {
        seedOtherSales();
        uint256 price = terms.grossPurchasePriceRaw;
        uint256 excess = token.balanceOf(BUYER) - (price - 1);
        vm.prank(BUYER);
        token.transfer(address(this), excess);
        approve(price);
        bytes memory data = fundingCall();
        Snapshot memory beforeState = snapshot();
        rejectUnchanged(
            data,
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, BUYER, price - 1, price),
            beforeState
        );
        token.transfer(BUYER, 1);
        assertExactFunding(data);
    }

    function rejectUnchanged(bytes memory data, bytes memory expectedError, Snapshot memory beforeState) private {
        require(beforeState.target.state == MarketTypes.State.ABSENT);
        require(!beforeState.consumed[0]);
        vm.prank(BUYER);
        (bool success, bytes memory reason) = address(market).call(data);
        require(!success && keccak256(reason) == keccak256(expectedError));
        require(keccak256(abi.encode(snapshot())) == keccak256(abi.encode(beforeState)));
        solvent();
    }

    function assertExactFunding(bytes memory data) private {
        Snapshot memory beforeState = snapshot();
        uint256 price = terms.grossPurchasePriceRaw;
        vm.prank(BUYER);
        (bool success, bytes memory result) = address(market).call(data);
        require(success);
        bytes32 id = abi.decode(result, (bytes32));
        require(id == SaleTermsLib.saleId(terms));
        MarketTypes.Sale memory stored = market.getSale(id);
        require(stored.state == MarketTypes.State.BOUND);
        require(keccak256(abi.encode(stored.terms)) == keccak256(abi.encode(terms)));
        beforeState.target = MarketTypes.Sale(terms, MarketTypes.State.BOUND);
        beforeState.balances[0] -= price;
        beforeState.balances[1] += price;
        beforeState.allowance -= price;
        beforeState.accounting[0] += price;
        beforeState.accounting[1] += price;
        beforeState.consumed[0] = true;
        require(keccak256(abi.encode(snapshot())) == keccak256(abi.encode(beforeState)));
        solvent();
    }

    function snapshot() private view returns (Snapshot memory state) {
        state.target = market.getSale(SaleTermsLib.saleId(terms));
        state.assigned = market.getSale(assignedId);
        state.bound = market.getSale(boundId);
        state.balances = [
            token.balanceOf(BUYER),
            token.balanceOf(address(market)),
            token.balanceOf(SELLER),
            token.balanceOf(FEE_RECIPIENT),
            token.balanceOf(address(this))
        ];
        state.allowance = token.allowance(BUYER, address(market));
        state.supply = token.totalSupply();
        state.accounting = [
            market.totalBound(),
            market.totalLiabilities(),
            market.totalCredits(),
            market.credits(BUYER),
            market.credits(SELLER),
            market.credits(FEE_RECIPIENT)
        ];
        state.consumed = [
            market.consumed(eventKey(99)),
            market.consumed(eventKey(97)),
            market.consumed(eventKey(98)),
            market.consumed(eventKey(100))
        ];
    }

    function seedOtherSales() private {
        SaleTermsLib.Terms memory other = terms;
        other.claimId = 2;
        assignedId = fundOther(other, 97);
        market.settleAssignment(
            eventProof(
                other,
                keccak256("SaleAssigned(bytes32,uint256,uint256,bytes32)"),
                abi.encode(SaleTermsLib.termsHash(other)),
                100
            ),
            0,
            assignedId
        );
        other.claimId = 3;
        boundId = fundOther(other, 98);
        require(market.totalBound() == terms.grossPurchasePriceRaw);
        require(market.totalCredits() == terms.grossPurchasePriceRaw);
        require(market.credits(SELLER) == 9363 && market.credits(FEE_RECIPIENT) == 47);
        solvent();
    }

    function fundOther(SaleTermsLib.Terms memory other, uint64 height) private returns (bytes32) {
        AttestcoinGate.ProofEnvelope memory proof = reservation(other);
        proof.blockHeight = height;
        vm.prank(BUYER);
        return market.fundReservation(proof, 0, other);
    }

    function fundingCall() private view returns (bytes memory) {
        return abi.encodeCall(MorrowMarket.fundReservation, (reservation(terms), 0, terms));
    }

    function approve(uint256 amount) private {
        vm.prank(BUYER);
        token.approve(address(market), amount);
    }

    function eventKey(uint64 height) private pure returns (bytes32) {
        return keccak256(abi.encode(uint64(1), height, uint64(7), uint256(0)));
    }
}
