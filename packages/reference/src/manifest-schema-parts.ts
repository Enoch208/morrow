export const objectSchema = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
export const arraySchema = (items: unknown, minItems = 0) => ({
  type: "array",
  items,
  minItems,
  maxItems: 10000,
});
export const schemaRef = (name: string) => ({ $ref: `#/definitions/${name}` });
export const textSchema = { type: "string", minLength: 1, maxLength: 2048 };
export const integerSchema = { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
export const hexSchema = { type: "string", pattern: "^0x(?:[0-9a-fA-F]{2})*$" };
export const hashSchema = { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" };
export const addressSchema = { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" };
export const decimalSchema = { type: "string", pattern: "^(0|[1-9][0-9]*)$", maxLength: 78 };
export const chainSchema = { enum: ["11155111", "102031"] };
export const dateSchema = {
  type: "string",
  pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$",
};
export const roleSchema = { enum: ["vault", "market", "sourceToken", "settlementToken"] };

export const definitions = {
  artifact: objectSchema({
    path: textSchema,
    sha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
  }),
  transaction: objectSchema({
    action: textSchema,
    chainId: chainSchema,
    transactionHash: hashSchema,
    blockNumber: integerSchema,
    blockHash: hashSchema,
    receiptStatus: { enum: [0, 1] },
    observedAt: dateSchema,
    receipt: schemaRef("artifact"),
  }),
  deployment: objectSchema({
    role: roleSchema,
    chainId: chainSchema,
    address: addressSchema,
    transactionHash: hashSchema,
    runtimeCodeHash: hashSchema,
    constructorArguments: arraySchema({ anyOf: [textSchema, integerSchema] }),
    artifact: schemaRef("artifact"),
  }),
  proof: objectSchema({
    sourceTransactionHash: hashSchema,
    sourceBlock: integerSchema,
    receiptLocalLogIndex: integerSchema,
    nativeTransactionIndex: decimalSchema,
    eventKey: hashSchema,
    nativeVerified: { const: true },
    observedAt: dateSchema,
    artifact: schemaRef("artifact"),
    decodedEvent: objectSchema({
      name: { enum: ["SaleReserved", "SaleAssigned", "SaleCancelled"] },
      saleId: hashSchema,
      claimId: decimalSchema,
      round: decimalSchema,
      termsHash: hashSchema,
    }),
  }),
  snapshot: objectSchema({
    chainId: chainSchema,
    blockNumber: integerSchema,
    blockHash: hashSchema,
    timestamp: integerSchema,
    reads: arraySchema(
      objectSchema({
        role: roleSchema,
        method: textSchema,
        args: arraySchema({ type: "string", maxLength: 256 }),
        raw: hexSchema,
      }),
      1,
    ),
  }),
};
