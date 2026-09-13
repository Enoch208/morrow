export type JsonRecord = Readonly<Record<string, unknown>>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stringField(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

export function numberField(record: JsonRecord, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" ? value : undefined;
}

export function booleanField(record: JsonRecord, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

export function recordField(record: JsonRecord, key: string): JsonRecord | undefined {
  const value = record[key];
  return isRecord(value) ? value : undefined;
}

export function isHex(value: string | undefined): value is `0x${string}` {
  return value !== undefined && /^0x[0-9a-fA-F]*$/.test(value);
}

export function fieldAt(record: JsonRecord, path: readonly string[]): unknown {
  let current: unknown = record;
  for (const key of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}
