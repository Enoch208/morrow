// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {SaleTermsLib} from "../../src/libraries/SaleTermsLib.sol";

contract CanonicalTermsTest {
    function test_T61_staticEncodingIsEighteenWords() public pure {
        SaleTermsLib.Terms memory terms = fixture();
        require(abi.encode(terms).length == 576);
        bytes memory encoded = abi.encode(terms);
        bytes memory expected =
            hex"00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000aa36a70000000000000000000000000000000000000000000000000000000000001001000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000018e8f000000000000000000000000000000000000000000000000000000000000100200000000000000000000000000000000000000000000000000000000000010030000000000000000000000000000000000000000000000000000000000001004000000000000000000000000000000000000000000000000000000000000100500000000000000000000000000000000000000000000000000000002540be400000000000000000000000000000000000000000000000000000000006b49d20000000000000000000000000000000000000000000000000000000000000010060000000000000000000000000000000000000000000000000000000230e1348000000000000000000000000000000000000000000000000000000000000000320000000000000000000000000000000000000000000000000000000000001007000000000000000000000000000000000000000000000000000000006b49aaf0000000000000000000000000000000000000000000000000000000006b49aed8";
        for (uint256 i; i < expected.length; ++i) {
            require(encoded[i] == expected[i]);
        }
        require(SaleTermsLib.termsHash(terms) == keccak256(abi.encode(terms)));
        require(SaleTermsLib.claimKey(terms) == 0x90cab66b70df98c5d4177767e830f9b1fb61aa5a0112c75fcc6687f7593a6ba8);
        require(SaleTermsLib.termsHash(terms) == 0xc3e9246c15b71d78e4257019a608dce94c17907bd6484469842c066eb9ba505f);
        require(SaleTermsLib.saleId(terms) == 0x10b3c01a6d138f7f93e6bd70b595ae8a06f47df3d9925924df6e391ad92bcee7);
    }

    function test_T31_eachNumericAndActorFieldChangesIdentity() public pure {
        SaleTermsLib.Terms memory terms = fixture();
        bytes32 original = SaleTermsLib.saleId(terms);
        terms.round++;
        require(SaleTermsLib.saleId(terms) != original);
        terms = fixture();
        terms.buyer = address(0xBAD);
        require(SaleTermsLib.saleId(terms) != original);
        terms = fixture();
        terms.destinationMarket = address(0xBAD);
        require(SaleTermsLib.saleId(terms) != original);
    }

    function fixture() private pure returns (SaleTermsLib.Terms memory terms) {
        terms = SaleTermsLib.Terms(
            1,
            11155111,
            address(0x1001),
            1,
            1,
            102031,
            address(0x1002),
            address(0x1003),
            address(0x1004),
            address(0x1005),
            10000000000,
            1800000000,
            address(0x1006),
            9410000000,
            50,
            address(0x1007),
            1799990000,
            1799991000
        );
    }
}
