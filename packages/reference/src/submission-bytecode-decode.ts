import { getBytes, hexlify } from "ethers";

interface Instruction {
  offset: number;
  opcode: number;
  operand: string;
}

export function bytes(value: string): Uint8Array {
  if (!/^0x(?:[0-9a-f]{2})+$/i.test(value)) throw new Error("Empty or malformed runtime bytecode");
  return getBytes(value);
}

export function executable(code: Uint8Array): Uint8Array {
  const size = code.length;
  const length = (code[size - 2] ?? 0) * 256 + (code[size - 1] ?? 0);
  const start = size - length - 2;
  const cbor = hexlify(code.slice(start, size - 2)).slice(2);
  if (
    length !== 51 ||
    start <= 0 ||
    code[start - 1] !== 0xfe ||
    !/^a2646970667358221220[0-9a-f]{64}64736f6c6343[0-9a-f]{6}$/.test(cbor)
  )
    throw new Error("Unsupported or invalid Solidity CBOR metadata trailer");
  const body = code.slice(0, start);
  const last = instructions(body).at(-1);
  if (last?.opcode !== 0xfe || last.offset !== start - 1)
    throw new Error("Solidity metadata delimiter is not an executable INVALID opcode");
  return body;
}

export function instructions(code: Uint8Array): Instruction[] {
  const result: Instruction[] = [];
  for (let offset = 0; offset < code.length;) {
    const opcode = code[offset];
    if (opcode === undefined) throw new Error("Missing opcode");
    const length = opcode >= 0x60 && opcode <= 0x7f ? opcode - 0x5f : 0;
    if (offset + length >= code.length) throw new Error("Truncated PUSH operand");
    result.push({ offset, opcode, operand: hexlify(code.slice(offset + 1, offset + length + 1)) });
    offset += length + 1;
  }
  return result;
}

export function ranges(value: unknown, code: Uint8Array) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid immutable references");
  const pushes = new Set(
    instructions(executable(code))
      .filter((i) => i.opcode === 0x7f)
      .map((i) => i.offset + 1),
  );
  const result: { id: string; start: number; length: number }[] = [];
  for (const [id, entries] of Object.entries(value)) {
    if (!/^\d+$/.test(id) || !Array.isArray(entries) || !entries.length)
      throw new Error("Invalid immutable group");
    for (const entry of entries as unknown[]) {
      if (
        !entry ||
        typeof entry !== "object" ||
        !("start" in entry) ||
        !("length" in entry) ||
        typeof entry.start !== "number" ||
        !Number.isSafeInteger(entry.start) ||
        entry.start < 0 ||
        entry.length !== 32 ||
        !pushes.has(entry.start)
      )
        throw new Error("Invalid immutable PUSH32 range");
      result.push({ id, start: entry.start, length: entry.length });
    }
  }
  result.sort((a, b) => a.start - b.start);
  for (let i = 1; i < result.length; i++) {
    const previous = result[i - 1];
    const current = result[i];
    if (!previous || !current || previous.start + previous.length > current.start)
      throw new Error("Overlapping immutable references");
  }
  return result;
}

export function dispatcher(code: Uint8Array, decoded: Instruction[]) {
  const hex = hexlify(code).slice(2);
  const preamble = "6080604052600436101561001257600080fd5b60003560e01c";
  if (!hex.startsWith(preamble)) throw new Error("Unsupported selector dispatcher preamble");
  const targets: { selector: string; offset: number }[] = [];
  let cursor = preamble.length;
  for (;;) {
    const match = /^(80)?63([0-9a-f]{8})1461([0-9a-f]{4})57/.exec(hex.slice(cursor));
    if (!match?.[2] || !match[3]) throw new Error("Unsupported selector dispatcher branch");
    targets.push({ selector: `0x${match[2]}`, offset: Number.parseInt(match[3], 16) });
    cursor += match[0].length;
    if (!match[1]) break;
  }
  if (hex.slice(cursor, cursor + 8) !== "600080fd")
    throw new Error("Unsupported dispatcher fallback");
  const jumpDestinations = new Set(decoded.filter((i) => i.opcode === 0x5b).map((i) => i.offset));
  if (
    targets.some(
      (target) => target.offset < (cursor + 8) / 2 || !jumpDestinations.has(target.offset),
    )
  )
    throw new Error("Invalid selector dispatcher jump destination");
  if (new Set(targets.map((target) => target.selector)).size !== targets.length)
    throw new Error("Duplicate dispatcher selector");
  return targets;
}
