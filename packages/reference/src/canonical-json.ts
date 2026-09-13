function sorted(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map((item: unknown) => sorted(item)).join(",") + "]";
  if (typeof value === "object" && value !== null)
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]: [string, unknown]) => JSON.stringify(key) + ":" + sorted(item))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}

export function canonicalJson(value: unknown): string {
  const plain: unknown = JSON.parse(JSON.stringify(value));
  return sorted(plain);
}
