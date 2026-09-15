// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LifecycleHandler} from "./LifecycleHandler.sol";
import {InvariantTargets} from "./InvariantTargets.sol";

contract LifecycleInvariantTest is InvariantTargets {
    LifecycleHandler private handler;

    function setUp() public {
        handler = newHandler();
        handler.cycle(true, 9410);
        handler.cycle(false, 9411);
    }

    function newHandler() internal virtual returns (LifecycleHandler) {
        return new LifecycleHandler();
    }

    function targetContracts() public view returns (address[] memory targets) {
        targets = new address[](1);
        targets[0] = address(handler);
    }

    function invariant_fundedOutcomesAndWithdrawalsConserveBacking() public view {
        handler.assertAccounting();
        require(handler.assignments() > 0 && handler.cancellations() > 0);
        require(handler.repeatedRounds() > 0 && handler.redemptions() > 0);
        require(handler.withdrawals() > 0 && handler.fundings() > 0);
    }

    function invariant_consumedEventsStayConsumedAndEverySaleHasItsReservation() public view {
        handler.assertConsumption();
    }

    function afterInvariant() public view {
        require(handler.fundings() > 4 && handler.redemptions() > 2);
        handler.assertAccounting();
        handler.assertConsumption();
    }
}
