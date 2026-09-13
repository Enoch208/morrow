import { Interface, keccak256 } from "ethers";
import type { JsonRpcProvider } from "ethers";
import { checkedArtifact, record, string } from "./evidence-files.ts";
import { EvidenceError } from "./checker-rpc.ts";
import { applicationPins } from "./manifest-chain.ts";
import type { DeploymentEvidence } from "./manifest-types.ts";

export async function checkManifestDeployment(
  deployment: DeploymentEvidence,
  rpc: JsonRpcProvider,
): Promise<void> {
  const pin = applicationPins[deployment.role];
  if (
    deployment.address !== pin.address ||
    deployment.chainId !== pin.chainId ||
    deployment.runtimeCodeHash !== pin.codeHash
  )
    throw new EvidenceError("Deployment provenance differs from fixed release domains");
  const [transaction, receipt, code] = await Promise.all([
    rpc.getTransaction(deployment.transactionHash),
    rpc.getTransactionReceipt(deployment.transactionHash),
    rpc.getCode(deployment.address),
  ]);
  if (
    transaction?.to !== null ||
    receipt?.status !== 1 ||
    receipt.contractAddress !== deployment.address ||
    keccak256(code) !== pin.codeHash
  )
    throw new EvidenceError("Mined deployment or runtime mismatch");
  const artifact = record(
    JSON.parse((await checkedArtifact(deployment.artifact)).toString("utf8")) as unknown,
  );
  const abi = new Interface(JSON.stringify(artifact.abi));
  const creation = string(record(artifact.bytecode).object);
  if (transaction.data !== creation + abi.encodeDeploy(deployment.constructorArguments).slice(2))
    throw new EvidenceError("Actual deployment calldata differs from compiled constructor");
  const block = await rpc.getBlock(receipt.blockNumber);
  if (block?.hash !== receipt.blockHash)
    throw new EvidenceError("Deployment receipt is not canonical");
}
