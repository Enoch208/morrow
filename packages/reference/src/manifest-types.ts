export interface ArtifactReference {
  readonly path: string;
  readonly sha256: string;
}

export type DeploymentRole = "vault" | "market" | "sourceToken" | "settlementToken";

export interface DeploymentEvidence {
  readonly role: DeploymentRole;
  readonly chainId: string;
  readonly address: string;
  readonly transactionHash: string;
  readonly runtimeCodeHash: string;
  readonly constructorArguments: readonly (string | number)[];
  readonly artifact: ArtifactReference;
}

export interface TransactionEvidence {
  readonly action: string;
  readonly chainId: string;
  readonly transactionHash: string;
  readonly blockNumber: number;
  readonly blockHash: string;
  readonly receiptStatus: number;
  readonly observedAt: string;
  readonly receipt: ArtifactReference;
}

export interface ProofEvidence {
  readonly sourceTransactionHash: string;
  readonly sourceBlock: number;
  readonly receiptLocalLogIndex: number;
  readonly nativeTransactionIndex: string;
  readonly eventKey: string;
  readonly nativeVerified: true;
  readonly observedAt: string;
  readonly artifact: ArtifactReference;
  readonly decodedEvent: {
    readonly name: "SaleReserved" | "SaleAssigned" | "SaleCancelled";
    readonly saleId: string;
    readonly claimId: string;
    readonly round: string;
    readonly termsHash: string;
  };
}

export interface StateRead {
  readonly role: DeploymentRole;
  readonly method: string;
  readonly args: readonly string[];
  readonly raw: string;
}

export interface ChainSnapshot {
  readonly chainId: string;
  readonly blockNumber: number;
  readonly blockHash: string;
  readonly timestamp: number;
  readonly reads: readonly StateRead[];
}

export interface CampaignManifest {
  readonly schemaVersion: 1;
  readonly evidenceKind: "live-read-verified";
  readonly campaignId: "gate" | "a" | "b";
  readonly generatedAt: string;
  readonly implementationCommit: string | null;
  readonly commitBlocker: string | null;
  readonly networks: {
    readonly sourceEvmChainId: "11155111";
    readonly destinationEvmChainId: "102031";
    readonly attestcoinChainKey: "1";
  };
  readonly deployments: readonly DeploymentEvidence[];
  readonly tokens: readonly {
    readonly address: string;
    readonly chainId: string;
    readonly decimals: number;
    readonly testToken: true;
  }[];
  readonly terms: Readonly<Record<string, string>>;
  readonly identity: {
    readonly encodedTerms: string;
    readonly termsHash: string;
    readonly saleId: string;
    readonly claimKey: string;
  };
  readonly transactions: readonly TransactionEvidence[];
  readonly proofs: readonly ProofEvidence[];
  readonly snapshots: readonly ChainSnapshot[];
  readonly timeline: ArtifactReference;
  readonly stateHistory: readonly ArtifactReference[];
  readonly withdrawals: readonly TransactionEvidence[];
  readonly phaseTimings: readonly {
    readonly action: string;
    readonly observedAt: string;
    readonly inclusionToObservedMs: number | null;
    readonly proofConstructionMs: number | null;
  }[];
  readonly failures: readonly {
    readonly action: string;
    readonly observedAt: string;
    readonly error: string;
  }[];
  readonly expectedOutcome: "assigned-and-redeemed" | "cancelled-refunded-and-redeemed";
  readonly actualOutcome: {
    readonly sourceRoundState: number;
    readonly destinationState: number;
    readonly redeemed: boolean;
  };
  readonly independentChecker: ArtifactReference | null;
  readonly unresolvedFacts: readonly string[];
}
