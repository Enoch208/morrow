import { Result } from "ethers";

export function resultField(value: unknown, key: string): unknown {
  if (!(value instanceof Result)) {
    return undefined;
  }
  const field: unknown = value.getValue(key);
  return field;
}

export function asBigInt(value: unknown): bigint | undefined {
  return typeof value === "bigint" ? value : undefined;
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
