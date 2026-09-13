"use client";

import { useEffect, useState } from "react";
import { isSourceHeightAttested } from "@/lib/chain/attestation";

export type AttestedState = "checking" | "attested" | "not-attested" | "unverifiable";

const cache = new Map<number, Promise<boolean>>();

function attestedOnce(height: number): Promise<boolean> {
  const existing = cache.get(height);
  if (existing) {
    return existing;
  }
  const request = isSourceHeightAttested(height);
  cache.set(height, request);
  request.catch(() => cache.delete(height));
  return request;
}

export function useAttested(height: number): AttestedState {
  const [state, setState] = useState<AttestedState>("checking");

  useEffect(() => {
    let active = true;
    attestedOnce(height).then(
      (attested) => {
        if (active) setState(attested ? "attested" : "not-attested");
      },
      () => {
        if (active) setState("unverifiable");
      },
    );
    return () => {
      active = false;
    };
  }, [height]);

  return state;
}
