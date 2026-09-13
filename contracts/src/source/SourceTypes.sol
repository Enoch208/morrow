// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {SaleTermsLib} from "../libraries/SaleTermsLib.sol";

library SourceTypes {
    enum RoundState {
        ABSENT,
        RESERVED,
        ASSIGNED,
        CANCELLED
    }

    struct Claim {
        address sourceToken;
        uint256 sourceFaceValueRaw;
        uint256 maturity;
        address originalBeneficiary;
        address currentBeneficiary;
        uint256 activeRound;
        uint256 latestRound;
        bool successfulSale;
        bool redeemed;
        bytes32 referenceHash;
    }

    struct Round {
        SaleTermsLib.Terms terms;
        RoundState state;
        bytes32 saleId;
        bytes32 termsHash;
    }
}
