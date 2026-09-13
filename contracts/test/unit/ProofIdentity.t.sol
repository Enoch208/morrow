// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MarketFixture} from "./MarketFixture.sol";
import {AttestcoinGate} from "../../src/libraries/AttestcoinGate.sol";
import {ProofBindingLib} from "../../src/libraries/ProofBindingLib.sol";
import {EvmV1Decoder} from "@gluwa/asc-contracts/contracts/common/EvmV1Decoder.sol";

contract ProofIdentityTest is MarketFixture {
    function test_T31_claimAndRoundTopicsMustMatchEvenWithMatchingSaleHash() public {
        for (uint256 topic = 2; topic <= 3; topic++) {
            AttestcoinGate.ProofEnvelope memory proof = reservation(terms);
            (uint8 encoding, bytes[] memory chunks) = abi.decode(proof.encodedTransaction, (uint8, bytes[]));
            (uint8 status, uint64 gasUsed, EvmV1Decoder.LogEntry[] memory logs, bytes memory bloom) =
                abi.decode(chunks[2], (uint8, uint64, EvmV1Decoder.LogEntry[], bytes));
            logs[0].topics[topic] = bytes32(uint256(2));
            chunks[2] = abi.encode(status, gasUsed, logs, bloom);
            proof.encodedTransaction = abi.encode(encoding, chunks);
            vm.prank(BUYER);
            vm.expectRevert(ProofBindingLib.ClaimRoundMismatch.selector);
            market.fundReservation(proof, 0, terms);
            require(market.totalLiabilities() == 0);
        }
        fund();
        solvent();
    }
}
