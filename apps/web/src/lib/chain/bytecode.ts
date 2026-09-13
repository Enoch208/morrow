import { getBytes } from "ethers";

const push1 = 0x60;
const push4 = 0x63;
const push32 = 0x7f;
const equal = 0x14;

export const forbiddenOpcodes = {
  DELEGATECALL: 0xf4,
  CALLCODE: 0xf2,
  SELFDESTRUCT: 0xff,
  CREATE: 0xf0,
  CREATE2: 0xf5,
} as const;

export type ForbiddenOpcode = keyof typeof forbiddenOpcodes;

export interface BytecodeScan {
  readonly executableBytes: number;
  readonly dispatchedSelectors: ReadonlySet<string>;
  readonly forbiddenCounts: Readonly<Record<ForbiddenOpcode, number>>;
}

function executableSection(code: Uint8Array): Uint8Array {
  if (code.length < 2) {
    return code;
  }
  const metadataLength = ((code[code.length - 2] ?? 0) << 8) | (code[code.length - 1] ?? 0);
  const end = code.length - 2 - metadataLength;
  return end > 0 ? code.subarray(0, end) : code;
}

function hexSelector(bytes: Uint8Array): string {
  return `0x${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function scanBytecode(runtimeCode: string): BytecodeScan {
  const code = executableSection(getBytes(runtimeCode));
  const dispatchedSelectors = new Set<string>();
  const counts: Record<ForbiddenOpcode, number> = {
    DELEGATECALL: 0,
    CALLCODE: 0,
    SELFDESTRUCT: 0,
    CREATE: 0,
    CREATE2: 0,
  };
  const names = Object.keys(forbiddenOpcodes) as ForbiddenOpcode[];
  for (let index = 0; index < code.length; index += 1) {
    const opcode = code[index] ?? 0;
    const forbidden = names.find((name) => forbiddenOpcodes[name] === opcode);
    if (forbidden) {
      counts[forbidden] += 1;
    }
    if (opcode >= push1 && opcode <= push32) {
      if (opcode === push4 && code[index + 5] === equal) {
        dispatchedSelectors.add(hexSelector(code.subarray(index + 1, index + 5)));
      }
      index += opcode - push1 + 1;
    }
  }
  return { executableBytes: code.length, dispatchedSelectors, forbiddenCounts: counts };
}
