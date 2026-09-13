export const preflightChecks = [
  "Connected account is the seller, on Sepolia",
  "Terms match the pinned vault, market, tokens, chains and protocol version",
  "Source round is still reserved for this seller, before its assignment deadline, with full backing",
  "Buyer funding transaction is mined, successful, finalized and matches these exact terms",
  "Market and settlement token bytecode match the released deployment",
  "The exact sale is BOUND on Creditcoin and market balance covers every liability",
  "Source is re-read and still assignable, with no reorganization between reads",
] as const;
