import { ContractFactory, getCreateAddress } from "ethers";
import { contractArtifact } from "./artifact.ts";
import {
  cc3Rpc,
  errorSummary,
  localConfiguration,
  localRole,
  provider,
  requireTestnet,
} from "./environment.ts";
import { recordSpike } from "./spike-log.ts";

const configuration = localConfiguration();
if (!configuration.SOURCE_CHAIN_RPC_URL) throw new Error("Missing source RPC configuration");
const source = provider(configuration.SOURCE_CHAIN_RPC_URL);
const destination = provider(configuration.CREDITCOIN_RPC_URL ?? cc3Rpc);

try {
  await Promise.all([requireTestnet(source, 11155111n), requireTestnet(destination, 102031n)]);
  const payer = localRole(configuration, "PAYER");
  const sourceNonce = await source.getTransactionCount(payer.address, "pending");
  const proposedEmitter = getCreateAddress({ from: payer.address, nonce: sourceNonce });
  const emitterArtifact = contractArtifact("NativeSpikeEmitter");
  const receiverArtifact = contractArtifact("NativeSpikeReceiver");
  const emitter = await new ContractFactory(
    emitterArtifact.abi,
    emitterArtifact.bytecode,
  ).getDeployTransaction();
  const receiver = await new ContractFactory(
    receiverArtifact.abi,
    receiverArtifact.bytecode,
  ).getDeployTransaction(proposedEmitter, payer.address);
  const [sourceGas, destinationGas, sourceFees, destinationFees] = await Promise.all([
    source.estimateGas({ ...emitter, from: payer.address }),
    destination.estimateGas({ ...receiver, from: payer.address }),
    source.getFeeData(),
    destination.getFeeData(),
  ]);
  const sourceGasPrice = sourceFees.maxFeePerGas ?? sourceFees.gasPrice;
  const destinationGasPrice = destinationFees.maxFeePerGas ?? destinationFees.gasPrice;
  if (sourceGasPrice === null || destinationGasPrice === null)
    throw new Error("Gas pricing unavailable");
  await recordSpike({
    action: "stage-a-plan",
    state: "planned",
    evidenceKind: "live-read-verified",
    actor: payer.address,
    proposedEmitter,
    addressStatus: "Predicted from current pending nonce; not a deployed contract",
    sourceNonce,
    sourceDeploymentCount: 2,
    sourceGasPerEmitter: sourceGas,
    sourceGasPrice,
    sourceDeploymentBufferedCost: 2n * ((sourceGas * 125n) / 100n) * sourceGasPrice,
    receiverGas: destinationGas,
    destinationGasPrice,
    receiverBufferedCost: ((destinationGas * 125n) / 100n) * destinationGasPrice,
    emitterArtifactHash: emitterArtifact.bytecodeHash,
    receiverArtifactHash: receiverArtifact.bytecodeHash,
    remainingActions: [
      "emit approved probe",
      "emit unapproved probe",
      "native verify both proofs by eth_call",
      "accept approved proof in mined CC3 transaction",
      "reject same authentic unapproved proof by eth_call",
    ],
    proposedTotalGasBudget: { sepoliaWei: "5000000000000000", cc3Wei: "50000000000000000" },
    budgetStatus:
      "proposed; requires human broadcast approval; includes deployment and later spike actions",
  });
} catch (error: unknown) {
  await recordSpike({
    action: "stage-a-plan",
    state: "blocked",
    evidenceKind: "blocked",
    error: errorSummary(error),
  });
  process.exitCode = 1;
} finally {
  source.destroy();
  destination.destroy();
}
