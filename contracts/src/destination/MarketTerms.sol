// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {SaleTermsLib} from "../libraries/SaleTermsLib.sol";

library MarketTerms {
    error WrongDeploymentDomain();
    error UnsupportedTerms();

    function validate(
        SaleTermsLib.Terms calldata terms,
        address sourceVault,
        address sourceToken,
        address settlementToken,
        address feeRecipient,
        uint16 feeBps
    ) internal view {
        if (
            terms.protocolVersion != 1 || terms.sourceEvmChainId != 11155111 || terms.sourceVault != sourceVault
                || terms.destinationEvmChainId != block.chainid || terms.destinationMarket != address(this)
        ) {
            revert WrongDeploymentDomain();
        }
        if (
            terms.sourceToken != sourceToken || terms.settlementToken != settlementToken || terms.feeBps != feeBps
                || terms.feeRecipient != feeRecipient || terms.seller == address(0) || terms.buyer == address(0)
                || terms.claimId == 0 || terms.round == 0 || terms.sourceFaceValueRaw == 0
                || terms.grossPurchasePriceRaw == 0 || terms.fundBefore == 0 || terms.fundBefore > terms.assignBefore
                || terms.assignBefore >= terms.maturity
        ) {
            revert UnsupportedTerms();
        }
    }
}
