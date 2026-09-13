export function shortHex(value: string, lead = 6, tail = 4): string {
  return value.length <= lead + tail + 1 ? value : `${value.slice(0, lead)}…${value.slice(-tail)}`;
}

export function utcTime(iso: string): string {
  return `${iso.slice(11, 19)} UTC`;
}

export function utcDateTimeFromUnix(seconds: bigint): string {
  const date = new Date(Number(seconds) * 1000);
  const month = date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const day = `${String(date.getUTCDate())} ${month}`;
  return `${day} ${date.toISOString().slice(11, 16)} UTC`;
}

export function utcDay(iso: string): string {
  const date = new Date(iso);
  const month = date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return `${String(date.getUTCDate())} ${month}`;
}

export function groupedNumber(value: number): string {
  return value.toLocaleString("en-US");
}
