// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

library SaleTermsLib {
    bytes32 internal constant DOMAIN = keccak256("MORROW_FUNDED_PAYMENT_SALE_V1");

    struct Terms {
        uint256 protocolVersion;
        uint256 sourceEvmChainId;
        address sourceVault;
        uint256 claimId;
        uint256 round;
        uint256 destinationEvmChainId;
        address destinationMarket;
        address seller;
        address buyer;
        address sourceToken;
        uint256 sourceFaceValueRaw;
        uint256 maturity;
        address settlementToken;
        uint256 grossPurchasePriceRaw;
        uint16 feeBps;
        address feeRecipient;
        uint256 fundBefore;
        uint256 assignBefore;
    }

    function claimKey(Terms memory terms) internal pure returns (bytes32) {
        return keccak256(abi.encode(terms.sourceEvmChainId, terms.sourceVault, terms.claimId));
    }

    function termsHash(Terms memory terms) internal pure returns (bytes32) {
        return keccak256(abi.encode(terms));
    }

    function saleId(Terms memory terms) internal pure returns (bytes32) {
        return keccak256(abi.encode(DOMAIN, claimKey(terms), terms.round, termsHash(terms)));
    }
}
