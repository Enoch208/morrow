// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SaleTermsLib} from "../libraries/SaleTermsLib.sol";
import {IStreamLockup} from "./IStreamLockup.sol";
import {SourceTypes} from "./SourceTypes.sol";
import {SourceTerms} from "./SourceTerms.sol";

contract StreamPaymentVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint8 private constant PRICE_GATED_MODEL = 3;

    IERC20 public immutable SOURCE_TOKEN;
    IStreamLockup public immutable LOCKUP;
    uint256 public nextClaimId = 1;
    uint256 public totalBacking;
    mapping(uint256 => SourceTypes.Claim) private claims;
    mapping(uint256 => mapping(uint256 => SourceTypes.Round)) private rounds;
    mapping(uint256 => uint256) public claimStream;
    mapping(uint256 => uint128) public withdrawnAtWrap;

    error InvalidClaim();
    error UnsupportedToken();
    error UnsupportedStream();
    error NotStreamOwner();
    error TransferDeltaMismatch();
    error EntitlementMismatch();
    error FeeRefundFailed();
    error InvalidBuyer();
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
    event StreamWrapped(uint256 indexed claimId, uint256 indexed streamId, uint128 withdrawnAtWrap);
    event SaleReserved(
        bytes32 indexed saleId, uint256 indexed claimId, uint256 indexed round, bytes32 termsHash, bytes canonicalTerms
    );
    event SaleAssigned(bytes32 indexed saleId, uint256 indexed claimId, uint256 indexed round, bytes32 termsHash);
    event SaleCancelled(bytes32 indexed saleId, uint256 indexed claimId, uint256 indexed round, bytes32 termsHash);
    event ClaimRedeemed(uint256 indexed claimId, address indexed beneficiary, address token, uint256 faceValueRaw);

    constructor(address token, address lockup) {
        if (block.chainid != 11155111 || token.code.length == 0 || lockup.code.length == 0) revert UnsupportedToken();
        SOURCE_TOKEN = IERC20(token);
        LOCKUP = IStreamLockup(lockup);
    }

    function wrapStream(uint256 streamId, bytes32 referenceHash) external nonReentrant returns (uint256 claimId) {
        if (LOCKUP.ownerOf(streamId) != msg.sender) revert NotStreamOwner();
        if (LOCKUP.getUnderlyingToken(streamId) != address(SOURCE_TOKEN)) revert UnsupportedToken();
        uint256 maturity = LOCKUP.getEndTime(streamId);
        if (
            LOCKUP.getLockupModel(streamId) == PRICE_GATED_MODEL || LOCKUP.isCancelable(streamId)
                || LOCKUP.wasCanceled(streamId) || !LOCKUP.isTransferable(streamId) || LOCKUP.isDepleted(streamId)
                || LOCKUP.getRefundedAmount(streamId) != 0 || maturity <= block.timestamp
        ) revert UnsupportedStream();
        LOCKUP.transferFrom(msg.sender, address(this), streamId);
        if (LOCKUP.ownerOf(streamId) != address(this)) revert NotStreamOwner();
        uint128 withdrawn = LOCKUP.getWithdrawnAmount(streamId);
        uint256 faceValueRaw = LOCKUP.getDepositedAmount(streamId) - withdrawn;
        if (faceValueRaw == 0) revert UnsupportedStream();
        claimId = nextClaimId++;
        claims[claimId] = SourceTypes.Claim(
            address(SOURCE_TOKEN), faceValueRaw, maturity, msg.sender, msg.sender, 0, 0, false, false, referenceHash
        );
        claimStream[claimId] = streamId;
        withdrawnAtWrap[claimId] = withdrawn;
        totalBacking += faceValueRaw;
        emit StreamWrapped(claimId, streamId, withdrawn);
        emit ClaimFunded(
            claimId,
            LOCKUP.getSender(streamId),
            msg.sender,
            address(SOURCE_TOKEN),
            faceValueRaw,
            maturity,
            referenceHash
        );
    }

    function reserveSale(uint256 claimId, SaleTermsLib.Terms calldata supplied)
        external
        nonReentrant
        returns (bytes32 saleId)
    {
        SourceTypes.Claim storage claim = existingClaim(claimId);
        if (msg.sender != claim.currentBeneficiary) revert NotBeneficiary();
        if (supplied.buyer == address(this)) revert InvalidBuyer();
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

    function redeem(uint256 claimId) external payable nonReentrant {
        SourceTypes.Claim storage claim = existingClaim(claimId);
        if (claim.redeemed || claim.activeRound != 0 || block.timestamp < claim.maturity) revert NotRedeemable();
        uint256 streamId = claimStream[claimId];
        claim.redeemed = true;
        totalBacking -= claim.sourceFaceValueRaw;
        bool depletedBefore = LOCKUP.isDepleted(streamId);
        if (!depletedBefore) LOCKUP.withdrawMax{value: msg.value}(streamId, address(this));
        if (
            !LOCKUP.isDepleted(streamId)
                || LOCKUP.getWithdrawnAmount(streamId) - withdrawnAtWrap[claimId] != claim.sourceFaceValueRaw
        ) revert EntitlementMismatch();
        uint256 recipientBalance = SOURCE_TOKEN.balanceOf(claim.currentBeneficiary);
        SOURCE_TOKEN.safeTransfer(claim.currentBeneficiary, claim.sourceFaceValueRaw);
        if (SOURCE_TOKEN.balanceOf(claim.currentBeneficiary) != recipientBalance + claim.sourceFaceValueRaw) {
            revert TransferDeltaMismatch();
        }
        emit ClaimRedeemed(claimId, claim.currentBeneficiary, claim.sourceToken, claim.sourceFaceValueRaw);
        if (depletedBefore && msg.value != 0) {
            (bool refunded,) = payable(msg.sender).call{value: msg.value}("");
            if (!refunded) revert FeeRefundFailed();
        }
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
