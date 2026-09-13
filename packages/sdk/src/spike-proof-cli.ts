import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { AbiCoder, isError, keccak256 } from "ethers";
import { contractArtifact } from "./artifact.ts";
import {
  cc3Rpc,
  errorSummary,
  localConfiguration,
  localRole,
  provider,
  proverEndpoints,
  repositoryRoot,
  requireTestnet,
} from "./environment.ts";
import { obtainProof, verifyNativeProof } from "./proof.ts";
import { recordSpike, spikeAddress, spikeRecords } from "./spike-log.ts";
import { submitSpike } from "./spike-submit.ts";

const variant = process.argv[2];
if (variant !== "approved" && variant !== "unapproved")
  throw new Error("Choose approved or unapproved");
const broadcast = process.argv.includes("--broadcast");
if (variant === "unapproved" && broadcast) throw new Error("Wrong-emitter case uses eth_call only");
const configuration = localConfiguration();
if (!configuration.SOURCE_CHAIN_RPC_URL) throw new Error("Missing source RPC configuration");
const source = provider(configuration.SOURCE_CHAIN_RPC_URL);
const destination = provider(configuration.CREDITCOIN_RPC_URL ?? cc3Rpc);
const action = `prove-${variant}`;

try {
  await Promise.all([requireTestnet(source, 11155111n), requireTestnet(destination, 102031n)]);
  const entry = (await spikeRecords())
    .reverse()
    .find((record) => record.action === `emit-${variant}` && record.state === "mined");
  if (!entry || typeof entry.transactionHash !== "string")
    throw new Error("No mined spike source event");
  const receipt = await source.getTransactionReceipt(entry.transactionHash);
  if (receipt?.status !== 1) throw new Error("Successful source receipt unavailable");
  const emitter = await spikeAddress(`deploy-${variant}`);
  const receiver = await spikeAddress("deploy-receiver");
  const emitterAbi = contractArtifact("NativeSpikeEmitter").abi;
  const receiverArtifact = contractArtifact("NativeSpikeReceiver");
  const matching = receipt.logs
    .map((log, index) => ({ log, index }))
    .filter(
      ({ log }) =>
        log.address.toLowerCase() === emitter.toLowerCase() &&
        log.topics[0] === emitterAbi.getEvent("ProbeEmitted")?.topicHash,
    );
  const selected = matching[0];
  if (!selected || matching.length !== 1) throw new Error("Missing or ambiguous source probe log");
  const decoded = emitterAbi.parseLog(selected.log);
  if (!decoded) throw new Error("Probe event decoding failed");
  const { proof, raw } = await obtainProof(entry.transactionHash, proverEndpoints[0]);
  const proofText = JSON.stringify(raw);
  const proofHash = createHash("sha256").update(proofText).digest("hex");
  const proofPath = `evidence/spike/proof-${Date.now().toString()}-${proofHash}.json`;
  await mkdir(`${repositoryRoot}evidence/spike`, { recursive: true });
  await writeFile(`${repositoryRoot}${proofPath}`, proofText, { flag: "wx" });
  if (proof.blockHeight !== BigInt(receipt.blockNumber))
    throw new Error("Proof source block mismatch");
  const native = await verifyNativeProof(destination, proof);
  if (native.provenTxIndex !== BigInt(receipt.index))
    throw new Error("Native transaction index differs from source receipt");
  const eventKey = keccak256(
    AbiCoder.defaultAbiCoder().encode(
      ["uint64", "uint64", "uint64", "uint256"],
      [proof.chainKey, proof.blockHeight, native.provenTxIndex, selected.index],
    ),
  );
  const abi = receiverArtifact.abi;
  const snapshot = async () => ({
    acceptedTotal: await destination.call({
      to: receiver,
      data: abi.encodeFunctionData("acceptedTotal"),
    }),
    consumed: await destination.call({
      to: receiver,
      data: abi.encodeFunctionData("consumed", [eventKey]),
    }),
  });
  const before = await snapshot();
  await recordSpike({
    action,
    state: "native-verified",
    evidenceKind: "live-read-verified",
    sourceTransactionHash: entry.transactionHash,
    proofPath,
    proofHash,
    native,
    eventKey,
    receiptLocalLogIndex: selected.index,
    decodedEventFields: decoded.args.toArray(),
    before,
  });
  const transaction = {
    to: receiver,
    data: abi.encodeFunctionData("accept", [proof, selected.index]),
  };
  if (variant === "unapproved") {
    let rejection: string | null = null;
    try {
      await destination.call(transaction);
    } catch (error: unknown) {
      if (!isError(error, "CALL_EXCEPTION") || !error.data) throw error;
      rejection = abi.parseError(error.data)?.name ?? error.data;
    }
    const after = await snapshot();
    await recordSpike({
      action,
      state: "semantic-refusal",
      evidenceKind: "live-read-verified",
      proofHash,
      proofPath,
      transactionHash: null,
      evidenceType: "eth_call rejection, not a mined reverted transaction",
      rejection,
      before,
      after,
    });
    if (rejection !== "WrongEmitter" || JSON.stringify(before) !== JSON.stringify(after))
      throw new Error("Wrong-emitter refusal did not preserve expected state");
  } else {
    const result = await destination.call(transaction);
    if (abi.decodeFunctionResult("accept", result)[0] !== eventKey)
      throw new Error("Application event identity mismatch");
    const wallet = localRole(configuration, "PAYER").connect(destination);
    const gas = await wallet.estimateGas(transaction);
    const fee = await destination.getFeeData();
    const gasPrice = fee.maxFeePerGas ?? fee.gasPrice;
    if (gasPrice === null) throw new Error("Gas price unavailable");
    await recordSpike({
      action,
      state: "planned",
      evidenceKind: "live-read-verified",
      proofHash,
      proofPath,
      estimatedGas: gas,
      gasPrice,
    });
    if (broadcast) {
      await submitSpike(
        wallet,
        action,
        102031n,
        transaction,
        (gas * 125n) / 100n,
        gasPrice,
        receiverArtifact.bytecodeHash,
      );
      const after = await snapshot();
      if (abi.decodeFunctionResult("consumed", after.consumed)[0] !== true)
        throw new Error("Mined receipt did not consume event");
      const amount: unknown = decoded.args[2];
      const oldTotal: unknown = abi.decodeFunctionResult("acceptedTotal", before.acceptedTotal)[0];
      const newTotal: unknown = abi.decodeFunctionResult("acceptedTotal", after.acceptedTotal)[0];
      if (
        typeof amount !== "bigint" ||
        typeof oldTotal !== "bigint" ||
        typeof newTotal !== "bigint" ||
        newTotal !== oldTotal + amount
      )
        throw new Error("Mined accepted amount mismatch");
      await recordSpike({
        action,
        state: "checked",
        evidenceKind: "live-read-verified",
        eventKey,
        before,
        after,
        proofHash,
        proofPath,
      });
    }
  }
} catch (error: unknown) {
  await recordSpike({
    action,
    state: "blocked",
    evidenceKind: "blocked",
    error: errorSummary(error),
  });
  process.exitCode = 1;
} finally {
  source.destroy();
  destination.destroy();
}
