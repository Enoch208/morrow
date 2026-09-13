// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SaleTermsLib} from "../libraries/SaleTermsLib.sol";
import {SourceTypes} from "./SourceTypes.sol";
import {SourceTerms} from "./SourceTerms.sol";

contract FundedPaymentVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable SOURCE_TOKEN;
    uint256 public nextClaimId = 1;
    uint256 public totalBacking;
    mapping(uint256 => SourceTypes.Claim) private claims;
    mapping(uint256 => mapping(uint256 => SourceTypes.Round)) private rounds;

    error InvalidClaim();
    error UnsupportedToken();
    error TransferDeltaMismatch();
    error NotBeneficiary();
    error NotReservable();
    error RoundMismatch();
    error TermsHashMismatch();
    error AssignmentExpired();
    error CancellationTooEarly();
    error NotRedeemable();

    event ClaimFunded(
        uint256 indexed claimId,
        address indexed payer,
        address indexed beneficiary,
        address token,
        uint256 faceValueRaw,
        uint256 maturity,
        bytes32 referenceHash
    );
    event SaleReserved(
        bytes32 indexed saleId, uint256 indexed claimId, uint256 indexed round, bytes32 termsHash, bytes canonicalTerms
    );
    event SaleAssigned(bytes32 indexed saleId, uint256 indexed claimId, uint256 indexed round, bytes32 termsHash);
    event SaleCancelled(bytes32 indexed saleId, uint256 indexed claimId, uint256 indexed round, bytes32 termsHash);
    event ClaimRedeemed(uint256 indexed claimId, address indexed beneficiary, address token, uint256 faceValueRaw);

    constructor(address token) {
        if (block.chainid != 11155111 || token == address(0) || token.code.length == 0) revert UnsupportedToken();
        SOURCE_TOKEN = IERC20(token);
    }

    function createClaim(
        address token,
        uint256 faceValueRaw,
        address beneficiary,
        uint256 maturity,
        bytes32 referenceHash
    ) external nonReentrant returns (uint256 claimId) {
        if (token != address(SOURCE_TOKEN)) revert UnsupportedToken();
        if (faceValueRaw == 0 || beneficiary == address(0) || maturity <= block.timestamp) revert InvalidClaim();
        uint256 balanceBefore = SOURCE_TOKEN.balanceOf(address(this));
        SOURCE_TOKEN.safeTransferFrom(msg.sender, address(this), faceValueRaw);
        if (SOURCE_TOKEN.balanceOf(address(this)) != balanceBefore + faceValueRaw) revert TransferDeltaMismatch();
        claimId = nextClaimId++;
        claims[claimId] = SourceTypes.Claim(
            token, faceValueRaw, maturity, beneficiary, beneficiary, 0, 0, false, false, referenceHash
        );
        totalBacking += faceValueRaw;
        emit ClaimFunded(claimId, msg.sender, beneficiary, token, faceValueRaw, maturity, referenceHash);
    }

    function reserveSale(uint256 claimId, SaleTermsLib.Terms calldata supplied)
        external
        nonReentrant
        returns (bytes32 saleId)
    {
        SourceTypes.Claim storage claim = existingClaim(claimId);
        if (msg.sender != claim.currentBeneficiary) revert NotBeneficiary();
        if (claim.redeemed || claim.successfulSale || claim.activeRound != 0 || block.timestamp >= claim.maturity) {
            revert NotReservable();
        }
        uint256 round = claim.latestRound + 1;
        SaleTermsLib.Terms memory terms = SourceTerms.bind(supplied, claim, claimId, round);
        saleId = SaleTermsLib.saleId(terms);
        bytes32 termsHash = SaleTermsLib.termsHash(terms);
        rounds[claimId][round] = SourceTypes.Round(terms, SourceTypes.RoundState.RESERVED, saleId, termsHash);
        claim.latestRound = round;
        claim.activeRound = round;
        emit SaleReserved(saleId, claimId, round, termsHash, abi.encode(terms));
    }

    function assignSale(uint256 claimId, uint256 expectedRound, bytes32 expectedTermsHash) external nonReentrant {
        SourceTypes.Claim storage claim = existingClaim(claimId);
        SourceTypes.Round storage round = activeRound(claim, claimId, expectedRound);
        if (msg.sender != round.terms.seller) revert NotBeneficiary();
        if (round.termsHash != expectedTermsHash) revert TermsHashMismatch();
        if (block.timestamp >= round.terms.assignBefore) revert AssignmentExpired();
        round.state = SourceTypes.RoundState.ASSIGNED;
        claim.currentBeneficiary = round.terms.buyer;
        claim.successfulSale = true;
        claim.activeRound = 0;
        emit SaleAssigned(round.saleId, claimId, expectedRound, round.termsHash);
    }

    function cancelExpiredSale(uint256 claimId, uint256 expectedRound) external nonReentrant {
        SourceTypes.Claim storage claim = existingClaim(claimId);
        SourceTypes.Round storage round = activeRound(claim, claimId, expectedRound);
        if (block.timestamp < round.terms.assignBefore) revert CancellationTooEarly();
        round.state = SourceTypes.RoundState.CANCELLED;
        claim.activeRound = 0;
        emit SaleCancelled(round.saleId, claimId, expectedRound, round.termsHash);
    }

    function redeem(uint256 claimId) external nonReentrant {
        SourceTypes.Claim storage claim = existingClaim(claimId);
        if (claim.redeemed || claim.activeRound != 0 || block.timestamp < claim.maturity) revert NotRedeemable();
        claim.redeemed = true;
        totalBacking -= claim.sourceFaceValueRaw;
        uint256 recipientBalance = SOURCE_TOKEN.balanceOf(claim.currentBeneficiary);
        SOURCE_TOKEN.safeTransfer(claim.currentBeneficiary, claim.sourceFaceValueRaw);
        if (SOURCE_TOKEN.balanceOf(claim.currentBeneficiary) != recipientBalance + claim.sourceFaceValueRaw) {
            revert TransferDeltaMismatch();
        }
        emit ClaimRedeemed(claimId, claim.currentBeneficiary, claim.sourceToken, claim.sourceFaceValueRaw);
    }

    function getClaim(uint256 claimId) external view returns (SourceTypes.Claim memory) {
        return existingClaim(claimId);
    }

    function getRound(uint256 claimId, uint256 round) external view returns (SourceTypes.Round memory) {
        return rounds[claimId][round];
    }

    function existingClaim(uint256 claimId) private view returns (SourceTypes.Claim storage claim) {
        claim = claims[claimId];
        if (claim.sourceFaceValueRaw == 0) revert InvalidClaim();
    }

    function activeRound(SourceTypes.Claim storage claim, uint256 claimId, uint256 expectedRound)
        private
        view
        returns (SourceTypes.Round storage round)
    {
        if (expectedRound == 0 || claim.activeRound != expectedRound) revert RoundMismatch();
        round = rounds[claimId][expectedRound];
        if (round.state != SourceTypes.RoundState.RESERVED) revert RoundMismatch();
    }
}
