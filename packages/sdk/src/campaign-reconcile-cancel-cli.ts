import { keccak256 } from "ethers";
import { campaignTerms, campaignContracts } from "./campaign-config.ts";
import { campaignRead, decodedInteger, verifyCampaignContract } from "./campaign-chain.ts";
import { campaignRecord, campaignRecords, recordCampaign, json } from "./campaign-log.ts";
import { decodedClaim, decodedTuple, decodedTerms } from "./decoded-state.ts";
import { assertCancelledTransition } from "./cancel-reconciliation.ts";
import { encodeTerms, saleIdentity } from "./canonical.ts";
import { ConfigurationError, provider } from "./environment.ts";

const source = provider("https://ethereum-sepolia-rpc.publicnode.com");
const terms = campaignTerms("b", 3n);
const identity = saleIdentity(terms);
try {
  const submitted = await campaignRecord("b-cancel", "submitted");
  const mined = await campaignRecord("b-cancel", "mined");
  if (
    typeof submitted.transactionHash !== "string" ||
    submitted.transactionHash !== mined.transactionHash ||
    typeof submitted.nonce !== "number" ||
    !Number.isSafeInteger(submitted.nonce) ||
    typeof submitted.sourceCheckBlock !== "number" ||
    !Number.isSafeInteger(submitted.sourceCheckBlock)
  )
    throw new ConfigurationError("Missing cancellation transaction coordinates");
  const abi = await verifyCampaignContract(source, "vault");
  await verifyCampaignContract(source, "sourceToken");
  const [transaction, receipt, finalized] = await Promise.all([
    source.getTransaction(submitted.transactionHash),
    source.getTransactionReceipt(submitted.transactionHash),
    source.getBlock("finalized"),
  ]);
  if (
    !receipt ||
    !transaction ||
    !finalized ||
    receipt.status !== 1 ||
    receipt.blockNumber > finalized.number
  )
    throw new ConfigurationError("Cancellation lacks finalized successful receipt");
  const block = await source.getBlock(receipt.blockNumber);
  const calldata = abi.encodeFunctionData("cancelExpiredSale", [terms.claimId, terms.round]);
  if (
    block?.hash !== receipt.blockHash ||
    BigInt(block.timestamp) < terms.assignBefore ||
    transaction.hash !== submitted.transactionHash ||
    transaction.chainId !== terms.sourceEvmChainId ||
    transaction.from !== terms.seller ||
    transaction.to !== terms.sourceVault ||
    transaction.nonce !== submitted.nonce ||
    transaction.data !== calldata ||
    transaction.value !== 0n ||
    keccak256(calldata) !== submitted.calldataHash ||
    submitted.sourceCheckBlock >= receipt.blockNumber
  )
    throw new ConfigurationError(
      "Cancellation sender, nonce, calldata or canonical block mismatch",
    );
  const logs = receipt.logs.filter(
    (log) =>
      log.address === campaignContracts.vault.address &&
      log.topics[0] === abi.getEvent("SaleCancelled")?.topicHash,
  );
  const event = logs[0] ? abi.parseLog(logs[0]) : null;
  if (
    logs.length !== 1 ||
    event?.args[0] !== identity.saleId ||
    event.args[1] !== terms.claimId ||
    event.args[2] !== terms.round ||
    event.args[3] !== identity.termsHash
  )
    throw new ConfigurationError("Cancellation event differs from exact approved sale");
  const snapshot = async (height: number) => {
    const [claim, round, balance, backing] = await Promise.all([
      campaignRead(source, "vault", "getClaim", [terms.claimId], height),
      campaignRead(source, "vault", "getRound", [terms.claimId, terms.round], height),
      campaignRead(source, "sourceToken", "balanceOf", [terms.seller], height),
      campaignRead(source, "vault", "totalBacking", [], height),
    ]);
    return { claim, round, balance, backing };
  };
  const [before, after] = await Promise.all([
    snapshot(submitted.sourceCheckBlock),
    snapshot(receipt.blockNumber),
  ]);
  const round = decodedTuple(after.round.decoded[0], 4);
  const previousRound = decodedTuple(before.round.decoded[0], 4);
  if (
    encodeTerms(decodedTerms(previousRound[0])) !== encodeTerms(terms) ||
    previousRound[1] !== 1n ||
    previousRound[2] !== identity.saleId ||
    previousRound[3] !== identity.termsHash ||
    encodeTerms(decodedTerms(round[0])) !== encodeTerms(terms) ||
    round[2] !== identity.saleId ||
    round[3] !== identity.termsHash
  )
    throw new ConfigurationError("Cancellation round commitment mismatch");
  const claim = decodedClaim(after.claim.decoded[0], terms.claimId);
  assertCancelledTransition(
    terms,
    decodedClaim(before.claim.decoded[0], terms.claimId),
    claim,
    decodedInteger(round[1]),
    decodedInteger(before.balance.decoded[0]),
    decodedInteger(after.balance.decoded[0]),
    decodedInteger(before.backing.decoded[0]),
    decodedInteger(after.backing.decoded[0]),
  );
  const result = {
    action: "b-cancel",
    state: "cancellation-verified",
    evidenceKind: "live-read-verified",
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash,
    claim,
    claimRaw: after.claim.raw,
    roundRaw: after.round.raw,
    beneficiaryBalanceRaw: after.balance.raw,
    backingRaw: after.backing.raw,
    sourceFacePaidRaw: 0n,
    reconciled: true,
    reconciliationBasis:
      "Canonical receipt, exact sender/nonce/calldata/event, historical pre/post state and unchanged balances",
    sourceCheckBlock: submitted.sourceCheckBlock,
    before: {
      claimRaw: before.claim.raw,
      roundRaw: before.round.raw,
      beneficiaryBalanceRaw: before.balance.raw,
      backingRaw: before.backing.raw,
    },
    finalizedReadBlock: finalized.number,
    signingEnabled: false,
  };
  if (
    process.argv.includes("--record") &&
    !(await campaignRecords()).some(
      (entry) => entry.action === "b-cancel" && entry.state === "cancellation-verified",
    )
  )
    await recordCampaign(result);
  else process.stdout.write(json({ ...result, recorded: false }) + "\n");
} finally {
  source.destroy();
}
