import { Fragment, Interface, hexlify, keccak256 } from "ethers";
import {
  bytes,
  executable,
  instructions,
  ranges,
  dispatcher,
} from "./submission-bytecode-decode.ts";
import type { InterfaceAbi } from "ethers";

type Status = "pass" | "fail" | "unverified";
interface Immutable {
  id: string;
  value: string;
  offsets: number[];
}
export interface RuntimeComparison {
  status: Status;
  reasons: string[];
  runtimeMatches: boolean | null;
  liveHash?: string;
  compiledHash?: string;
  maskedHash?: string;
  immutables?: Immutable[];
}
export interface DispatcherInspection {
  status: Status;
  opcodeStatus: Status;
  reasons: string[];
  selectorMatches: boolean | null;
  selectors: string[];
  dispatcherTargets: { selector: string; offset: number }[];
  forbiddenOpcodes: { opcode: string; offset: number }[];
  executableBytes?: number;
  metadataBytes?: number;
}

export function compareRuntime(
  liveRuntime: string,
  compiledRuntime: string,
  immutableReferences: unknown,
): RuntimeComparison {
  try {
    const live = bytes(liveRuntime),
      compiled = bytes(compiledRuntime);
    const hashes = { liveHash: keccak256(live), compiledHash: keccak256(compiled) };
    const references = ranges(immutableReferences, compiled);
    if (live.length !== compiled.length)
      return {
        ...hashes,
        status: "fail",
        reasons: ["Runtime byte lengths differ"],
        runtimeMatches: false,
      };
    const immutables: Immutable[] = [];
    for (const { id, start, length } of references) {
      if (compiled.slice(start, start + length).some((value) => value !== 0))
        throw new Error("Compiled immutable placeholder is not zero");
      const value = hexlify(live.slice(start, start + length));
      const prior = immutables.find((item) => item.id === id);
      if (prior && prior.value !== value)
        return {
          ...hashes,
          status: "fail",
          reasons: ["Repeated immutable values differ"],
          runtimeMatches: false,
        };
      if (prior) prior.offsets.push(start);
      else immutables.push({ id, value, offsets: [start] });
      live.fill(0, start, start + length);
      compiled.fill(0, start, start + length);
    }
    const maskedHash = keccak256(live);
    const runtimeMatches = maskedHash === keccak256(compiled);
    return {
      ...hashes,
      maskedHash,
      immutables,
      runtimeMatches,
      status: runtimeMatches ? "pass" : "fail",
      reasons: runtimeMatches ? [] : ["Runtime differs outside declared immutable operands"],
    };
  } catch (error: unknown) {
    return {
      status: "unverified",
      reasons: [error instanceof Error ? error.message : String(error)],
      runtimeMatches: null,
    };
  }
}

export function inspectDispatcher(runtime: string, abi: InterfaceAbi): DispatcherInspection {
  const result: DispatcherInspection = {
    status: "unverified",
    opcodeStatus: "unverified",
    reasons: [],
    selectorMatches: null,
    selectors: [],
    dispatcherTargets: [],
    forbiddenOpcodes: [],
  };
  try {
    const raw = bytes(runtime),
      code = executable(raw),
      decoded = instructions(code);
    result.executableBytes = code.length;
    result.metadataBytes = raw.length - code.length;
    const forbidden = new Map([
      [0xf4, "DELEGATECALL"],
      [0xf2, "CALLCODE"],
      [0xff, "SELFDESTRUCT"],
      [0xf0, "CREATE"],
      [0xf5, "CREATE2"],
    ]);
    result.forbiddenOpcodes = decoded.flatMap((i) => {
      const opcode = forbidden.get(i.opcode);
      return opcode ? [{ opcode, offset: i.offset }] : [];
    });
    result.opcodeStatus = result.forbiddenOpcodes.length ? "fail" : "pass";
    const entries: unknown = typeof abi === "string" ? JSON.parse(abi) : abi;
    if (!Array.isArray(entries)) throw new Error("Invalid function ABI");
    const iface = new Interface(entries.map((entry: unknown) => Fragment.from(entry))),
      expected: string[] = [];
    iface.forEachFunction((fragment) => {
      expected.push(fragment.selector);
    });
    result.dispatcherTargets = dispatcher(code, decoded);
    result.selectors = result.dispatcherTargets.map((target) => target.selector).sort();
    result.selectorMatches = JSON.stringify(result.selectors) === JSON.stringify(expected.sort());
    if (iface.fragments.some((fragment) => fragment.type === "fallback"))
      throw new Error("Fallback ABI is unsupported");
    if (!result.selectorMatches)
      result.reasons.push("Dispatcher selectors differ from function ABI");
    if (result.forbiddenOpcodes.length) result.reasons.push("Forbidden executable opcode present");
    result.status = result.reasons.length ? "fail" : "pass";
  } catch (error: unknown) {
    result.reasons.push(error instanceof Error ? error.message : String(error));
    result.status = result.forbiddenOpcodes.length ? "fail" : "unverified";
  }
  return result;
}

export function verifySubmissionBytecode(
  liveRuntime: string,
  compiledRuntime: string,
  immutableReferences: unknown,
  abi: InterfaceAbi,
) {
  const runtime = compareRuntime(liveRuntime, compiledRuntime, immutableReferences);
  const inspection = inspectDispatcher(liveRuntime, abi);
  const status: Status =
    runtime.status === "fail" || inspection.status === "fail"
      ? "fail"
      : runtime.status === "unverified" || inspection.status === "unverified"
        ? "unverified"
        : "pass";
  return {
    ...runtime,
    ...inspection,
    runtime,
    inspection,
    status,
    reasons: [...runtime.reasons, ...inspection.reasons],
  };
}
