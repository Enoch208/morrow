// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {SaleTermsLib} from "../libraries/SaleTermsLib.sol";

library MarketTypes {
    enum State {
        ABSENT,
        BOUND,
        ASSIGNED_CLAIMABLE,
        CANCELLED_CLAIMABLE
    }

    struct Sale {
        SaleTermsLib.Terms terms;
        State state;
    }
}
