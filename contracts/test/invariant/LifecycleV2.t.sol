// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {LifecycleHandler} from "./LifecycleHandler.sol";
import {LifecycleInvariantTest} from "./LifecycleInvariant.t.sol";
import {AssignmentUniquenessTest} from "../unit/AssignmentUniqueness.t.sol";
import {HistoricalAssignmentTest} from "../unit/HistoricalAssignment.t.sol";
import {MultiLogTest} from "../unit/MultiLog.t.sol";
import {RoundReplayTest} from "../unit/RoundReplay.t.sol";

contract LifecycleHandlerV2 is LifecycleHandler {
    function usesMarketV2() internal pure override returns (bool) {
        return true;
    }
}

contract AssignmentUniquenessV2Test is AssignmentUniquenessTest {
    function usesMarketV2() internal pure override returns (bool) {
        return true;
    }
}

contract HistoricalAssignmentV2Test is HistoricalAssignmentTest {
    function usesMarketV2() internal pure override returns (bool) {
        return true;
    }
}

contract MultiLogV2Test is MultiLogTest {
    function usesMarketV2() internal pure override returns (bool) {
        return true;
    }
}

contract RoundReplayV2Test is RoundReplayTest {
    function usesMarketV2() internal pure override returns (bool) {
        return true;
    }
}

contract LifecycleInvariantV2Test is LifecycleInvariantTest {
    function newHandler() internal override returns (LifecycleHandler) {
        return new LifecycleHandlerV2();
    }
}
