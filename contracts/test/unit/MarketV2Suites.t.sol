// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CorruptedProofTest} from "./CorruptedProof.t.sol";
import {FeeDecimalsTest} from "./FeeDecimals.t.sol";
import {FundingRollbackTest} from "./FundingRollback.t.sol";
import {MarketRejectionsTest} from "./MarketRejections.t.sol";
import {MorrowMarketTest} from "./MorrowMarket.t.sol";
import {OutgoingDeltaTest} from "./OutgoingDelta.t.sol";
import {ProofBoundaryTest} from "./ProofBoundary.t.sol";
import {ProofIdentityTest} from "./ProofIdentity.t.sol";
import {TokenSafetyTest} from "./TokenSafety.t.sol";

contract CorruptedProofV2Test is CorruptedProofTest {
    function usesMarketV2() internal pure override returns (bool) {
        return true;
    }
}

contract FeeDecimalsV2Test is FeeDecimalsTest {
    function usesMarketV2() internal pure override returns (bool) {
        return true;
    }
}

contract FundingRollbackV2Test is FundingRollbackTest {
    function usesMarketV2() internal pure override returns (bool) {
        return true;
    }
}

contract MarketRejectionsV2Test is MarketRejectionsTest {
    function usesMarketV2() internal pure override returns (bool) {
        return true;
    }
}

contract MorrowMarketV2Test is MorrowMarketTest {
    function usesMarketV2() internal pure override returns (bool) {
        return true;
    }
}

contract OutgoingDeltaV2Test is OutgoingDeltaTest {
    function usesMarketV2() internal pure override returns (bool) {
        return true;
    }
}

contract ProofBoundaryV2Test is ProofBoundaryTest {
    function usesMarketV2() internal pure override returns (bool) {
        return true;
    }
}

contract ProofIdentityV2Test is ProofIdentityTest {
    function usesMarketV2() internal pure override returns (bool) {
        return true;
    }
}

contract TokenSafetyV2Test is TokenSafetyTest {
    function usesMarketV2() internal pure override returns (bool) {
        return true;
    }
}
