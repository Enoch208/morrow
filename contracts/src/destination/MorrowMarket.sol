// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {AttestcoinGate} from "../libraries/AttestcoinGate.sol";
import {ProofBindingLib} from "../libraries/ProofBindingLib.sol";
import {SaleTermsLib} from "../libraries/SaleTermsLib.sol";
import {MarketTypes} from "./MarketTypes.sol";
import {MarketTerms} from "./MarketTerms.sol";

contract MorrowMarket is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable SETTLEMENT_TOKEN;
    address public immutable SOURCE_VAULT;
    address public immutable SOURCE_TOKEN;
    address public immutable FEE_RECIPIENT;
    uint16 public immutable FEE_BPS;
    uint256 public totalLiabilities;
    uint256 public totalBound;
    uint256 public totalCredits;
    mapping(bytes32 => MarketTypes.Sale) private sales;
    mapping(bytes32 => bool) public consumed;
    mapping(address => uint256) public credits;

    error InvalidConfiguration();
    error NotBuyer();
    error SaleAlreadyExists();
    error SaleNotBound();
    error EventAlreadyConsumed();
    error FundingClosed();
    error TransferDeltaMismatch();
    error NoCredit();

    event ReservationFunded(
        bytes32 indexed saleId, bytes32 indexed eventKey, address indexed buyer, uint256 grossPrice
    );
    event AssignmentRecognized(bytes32 indexed saleId, bytes32 indexed eventKey, uint256 sellerNet, uint256 fee);
    event CancellationRecognized(bytes32 indexed saleId, bytes32 indexed eventKey, uint256 refund);
    event CreditWithdrawn(address indexed recipient, address indexed token, uint256 amount);

    constructor(
        address settlementToken,
        address sourceVault,
        address sourceToken,
        address feeRecipient,
        uint16 feeBps
    ) {
        if (
            block.chainid != 102031 || settlementToken == address(0) || settlementToken.code.length == 0
                || sourceVault == address(0) || sourceToken == address(0) || feeRecipient == address(0) || feeBps > 100
        ) {
            revert InvalidConfiguration();
        }
        SETTLEMENT_TOKEN = IERC20(settlementToken);
        SOURCE_VAULT = sourceVault;
        SOURCE_TOKEN = sourceToken;
        FEE_RECIPIENT = feeRecipient;
        FEE_BPS = feeBps;
    }

    function fundReservation(
        AttestcoinGate.ProofEnvelope calldata proof,
        uint256 logIndex,
        SaleTermsLib.Terms calldata terms
    ) external nonReentrant returns (bytes32 saleId) {
        bytes32 eventKey = ProofBindingLib.reservation(proof, logIndex, terms, SOURCE_VAULT);
        MarketTerms.validate(terms, SOURCE_VAULT, SOURCE_TOKEN, address(SETTLEMENT_TOKEN), FEE_RECIPIENT, FEE_BPS);
        if (msg.sender != terms.buyer) revert NotBuyer();
        saleId = SaleTermsLib.saleId(terms);
        if (sales[saleId].state != MarketTypes.State.ABSENT) revert SaleAlreadyExists();
        if (block.timestamp >= terms.fundBefore) revert FundingClosed();
        consume(eventKey);
        sales[saleId] = MarketTypes.Sale(terms, MarketTypes.State.BOUND);
        uint256 price = terms.grossPurchasePriceRaw;
        totalBound += price;
        totalLiabilities += price;
        uint256 beforeBalance = SETTLEMENT_TOKEN.balanceOf(address(this));
        SETTLEMENT_TOKEN.safeTransferFrom(msg.sender, address(this), price);
        if (SETTLEMENT_TOKEN.balanceOf(address(this)) != beforeBalance + price) revert TransferDeltaMismatch();
        emit ReservationFunded(saleId, eventKey, msg.sender, price);
    }

    function settleAssignment(AttestcoinGate.ProofEnvelope calldata proof, uint256 logIndex, bytes32 saleId)
        external
        nonReentrant
    {
        MarketTypes.Sale storage sale = boundSale(saleId);
        bytes32 eventKey = ProofBindingLib.outcome(proof, logIndex, sale.terms, SOURCE_VAULT, true);
        consume(eventKey);
        sale.state = MarketTypes.State.ASSIGNED_CLAIMABLE;
        uint256 price = sale.terms.grossPurchasePriceRaw;
        uint256 fee = Math.mulDiv(price, sale.terms.feeBps, 10000);
        allocate(sale.terms.seller, price - fee);
        allocate(sale.terms.feeRecipient, fee);
        totalBound -= price;
        emit AssignmentRecognized(saleId, eventKey, price - fee, fee);
    }

    function recognizeCancellation(AttestcoinGate.ProofEnvelope calldata proof, uint256 logIndex, bytes32 saleId)
        external
        nonReentrant
    {
        MarketTypes.Sale storage sale = boundSale(saleId);
        bytes32 eventKey = ProofBindingLib.outcome(proof, logIndex, sale.terms, SOURCE_VAULT, false);
        consume(eventKey);
        sale.state = MarketTypes.State.CANCELLED_CLAIMABLE;
        uint256 price = sale.terms.grossPurchasePriceRaw;
        allocate(sale.terms.buyer, price);
        totalBound -= price;
        emit CancellationRecognized(saleId, eventKey, price);
    }

    function withdraw() external nonReentrant {
        uint256 amount = credits[msg.sender];
        if (amount == 0) revert NoCredit();
        credits[msg.sender] = 0;
        totalCredits -= amount;
        totalLiabilities -= amount;
        uint256 beforeBalance = SETTLEMENT_TOKEN.balanceOf(msg.sender);
        SETTLEMENT_TOKEN.safeTransfer(msg.sender, amount);
        if (SETTLEMENT_TOKEN.balanceOf(msg.sender) != beforeBalance + amount) revert TransferDeltaMismatch();
        emit CreditWithdrawn(msg.sender, address(SETTLEMENT_TOKEN), amount);
    }

    function getSale(bytes32 saleId) external view returns (MarketTypes.Sale memory) {
        return sales[saleId];
    }

    function boundSale(bytes32 saleId) private view returns (MarketTypes.Sale storage sale) {
        sale = sales[saleId];
        if (sale.state != MarketTypes.State.BOUND) revert SaleNotBound();
    }

    function consume(bytes32 eventKey) private {
        if (consumed[eventKey]) revert EventAlreadyConsumed();
        consumed[eventKey] = true;
    }

    function allocate(address recipient, uint256 amount) private {
        credits[recipient] += amount;
        totalCredits += amount;
    }
}
