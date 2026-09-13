import { mkdir, writeFile } from "node:fs/promises";
import { keccak256 } from "ethers";
import { referenceIdentity, referenceTerms } from "./index.ts";
import {
  EvidenceError,
  interfaces,
  integer,
  pins,
  read,
  root,
  rpcPair,
  tuple,
} from "./checker-rpc.ts";
import { checkReservationProof } from "./checker-native.ts";

const hash = process.argv[2];
if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash))
  throw new EvidenceError("Provide a mined funding transaction hash");
const { source, destination } = rpcPair();
try {
  if (
    (await source.getNetwork()).chainId !== 11155111n ||
    (await destination.getNetwork()).chainId !== 102031n
  )
    throw new EvidenceError("Wrong testnet RPC");
  const [transaction, receipt] = await Promise.all([
    destination.getTransaction(hash),
    destination.getTransactionReceipt(hash),
  ]);
  if (!transaction || receipt?.status !== 1 || transaction.to !== pins.market)
    throw new EvidenceError("Successful funding transaction unavailable");
  const parsed = interfaces.market.parseTransaction({
    data: transaction.data,
    value: transaction.value,
  });
  if (parsed?.name !== "fundReservation" || transaction.value !== 0n)
    throw new EvidenceError("Not an approved market funding call");
  const terms = referenceTerms(tuple(parsed.args[2]));
  const identity = referenceIdentity(terms);
  if (
    terms.protocolVersion !== "1" ||
    terms.sourceEvmChainId !== "11155111" ||
    terms.destinationEvmChainId !== "102031" ||
    terms.sourceVault !== pins.vault ||
    terms.destinationMarket !== pins.market ||
    terms.sourceToken !== pins.sourceToken ||
    terms.settlementToken !== pins.token ||
    terms.buyer !== transaction.from
  )
    throw new EvidenceError("Funding terms differ from pinned domains/actor");
  const [sourceCode, marketCode, tokenCode, sourceTokenCode] = await Promise.all([
    source.getCode(pins.vault),
    destination.getCode(pins.market, receipt.blockNumber),
    destination.getCode(pins.token, receipt.blockNumber),
    source.getCode(pins.sourceToken),
  ]);
  if (
    keccak256(sourceCode) !== pins.sourceCodeHash ||
    keccak256(marketCode) !== pins.marketCodeHash ||
    keccak256(tokenCode) !== pins.tokenCodeHash ||
    keccak256(sourceTokenCode) !== pins.tokenCodeHash
  )
    throw new EvidenceError("Compiled deployment runtime mismatch");
  const proof = await checkReservationProof(
    source,
    destination,
    tuple(parsed.args[0]),
    integer(parsed.args[1]),
    terms,
    receipt.blockNumber,
  );
  const [saleRead, liabilities, bound, credits, balance, consumed] = await Promise.all([
    read(destination, "market", "getSale", [identity.saleId], receipt.blockNumber),
    read(destination, "market", "totalLiabilities", [], receipt.blockNumber),
    read(destination, "market", "totalBound", [], receipt.blockNumber),
    read(destination, "market", "totalCredits", [], receipt.blockNumber),
    read(destination, "token", "balanceOf", [pins.market], receipt.blockNumber),
    read(destination, "market", "consumed", [proof.eventKey], receipt.blockNumber),
  ]);
  const sale = tuple(saleRead.decoded[0]);
  if (
    integer(sale[1]) !== 1n ||
    referenceIdentity(referenceTerms(tuple(sale[0]))).encodedTerms !== identity.encodedTerms ||
    consumed.decoded[0] !== true
  )
    throw new EvidenceError("Exact funded BOUND state or event consumption mismatch");
  if (
    integer(liabilities.decoded[0]) !== integer(bound.decoded[0]) + integer(credits.decoded[0]) ||
    integer(balance.decoded[0]) < integer(liabilities.decoded[0])
  )
    throw new EvidenceError("Destination liabilities not covered");
  const events = receipt.logs.filter(
    (log) =>
      log.address === pins.market &&
      log.topics[0] === interfaces.market.getEvent("ReservationFunded")?.topicHash,
  );
  const event = events[0] ? interfaces.market.parseLog(events[0]) : null;
  if (
    events.length !== 1 ||
    event?.args[0] !== identity.saleId ||
    event.args[1] !== proof.eventKey ||
    event.args[2] !== terms.buyer ||
    integer(event.args[3]).toString() !== terms.grossPurchasePriceRaw
  )
    throw new EvidenceError("Funding event differs from authenticated sale");
  const rawReceipt: unknown = receipt.toJSON();
  const report = {
    observedAt: new Date().toISOString(),
    evidenceKind: "historical-replay",
    independentOfProductionOutcomeRoutines: true,
    fundingTransactionHash: hash,
    fundingBlock: receipt.blockNumber,
    fundingBlockHash: receipt.blockHash,
    terms,
    ...identity,
    proof,
    fundingCalldata: transaction.data,
    fundingReceipt: rawReceipt,
    saleRaw: saleRead.raw,
    liabilitiesRaw: liabilities.raw,
    marketBalanceRaw: balance.raw,
    checksPassed: [
      "native-authenticity",
      "source-receipt-match",
      "canonical-terms",
      "both-deployment-domains",
      "buyer-authority",
      "runtime-provenance",
      "bound-state",
      "event-identity",
      "liability-coverage",
    ],
    limitations:
      "Checks the historical funding block; does not claim latest ownership, terminal settlement, a release audit or completion of every evidence scenario",
  };
  const path = `evidence/independent/funding-${hash.slice(2)}-${Date.now().toString()}.json`;
  await mkdir(`${root}evidence/independent`, { recursive: true });
  await writeFile(
    `${root}${path}`,
    JSON.stringify(
      report,
      (_, value: unknown) => (typeof value === "bigint" ? value.toString() : value),
      2,
    ) + "\n",
    { flag: "wx" },
  );
  process.stdout.write(
    JSON.stringify({ path, saleId: identity.saleId, checksPassed: report.checksPassed }) + "\n",
  );
} catch (error: unknown) {
  process.stderr.write(
    (error instanceof EvidenceError
      ? error.message
      : "Independent verification failed; inspect network/data without exposing credentials") +
      "\n",
  );
  process.exitCode = 1;
} finally {
  source.destroy();
  destination.destroy();
}
