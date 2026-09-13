import { c5Times } from "./c5-config.ts";
import { ConfigurationError } from "./errors.ts";

export function assertC5ReadinessTimestamp(value: unknown, now: number, initial: boolean): void {
  const observed = typeof value === "string" ? Date.parse(value) : NaN;
  if (
    !Number.isFinite(observed) ||
    observed < 0 ||
    observed > now ||
    observed > Number(c5Times.readiness) * 1000
  )
    throw new ConfigurationError("C5 readiness not valid before the approved cutoff");
  if (initial && (now - observed > 300000 || now > Number(c5Times.launch) * 1000))
    throw new ConfigurationError("C5 initial readiness stale or launch window elapsed");
}
