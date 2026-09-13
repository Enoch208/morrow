// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {SaleTermsLib} from "../libraries/SaleTermsLib.sol";
import {SourceTypes} from "./SourceTypes.sol";

library SourceTerms {
    error TermsMismatch();
    error InvalidSaleTerms();

    function bind(SaleTermsLib.Terms calldata supplied, SourceTypes.Claim storage claim, uint256 claimId, uint256 round)
        internal
        view
        returns (SaleTermsLib.Terms memory canonical)
    {
        canonical = supplied;
        canonical.protocolVersion = 1;
        canonical.sourceEvmChainId = block.chainid;
        canonical.sourceVault = address(this);
        canonical.claimId = claimId;
        canonical.round = round;
        canonical.seller = claim.currentBeneficiary;
        canonical.sourceToken = claim.sourceToken;
        canonical.sourceFaceValueRaw = claim.sourceFaceValueRaw;
        canonical.maturity = claim.maturity;
        if (SaleTermsLib.termsHash(canonical) != SaleTermsLib.termsHash(supplied)) revert TermsMismatch();
        if (
            canonical.destinationEvmChainId != 102031 || canonical.destinationMarket == address(0)
                || canonical.buyer == address(0) || canonical.settlementToken == address(0)
                || canonical.grossPurchasePriceRaw == 0 || canonical.feeBps > 100
                || canonical.feeRecipient == address(0) || canonical.fundBefore == 0
                || canonical.fundBefore > canonical.assignBefore || canonical.assignBefore <= block.timestamp
                || canonical.assignBefore >= claim.maturity
        ) revert InvalidSaleTerms();
    }
}
