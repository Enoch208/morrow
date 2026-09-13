export function formatUnits(raw: bigint, decimals: number): string {
  const unit = 10n ** BigInt(decimals);
  const whole = raw / unit;
  const fraction = (raw % unit).toString().padStart(decimals, "0").replace(/0+$/, "");
  const grouped = whole.toLocaleString("en-US");
  return fraction ? `${grouped}.${fraction}` : grouped;
}

export function feeFor(grossRaw: bigint, feeBps: bigint): bigint {
  return (grossRaw * feeBps) / 10_000n;
}
