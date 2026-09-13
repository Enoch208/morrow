import { readFileSync } from "node:fs";
import { Interface, isHexString, keccak256 } from "ethers";
import { repositoryRoot } from "./environment.ts";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function contractArtifact(name: string): {
  abi: Interface;
  bytecode: string;
  bytecodeHash: string;
} {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) throw new Error("Invalid artifact name");
  const value: unknown = JSON.parse(
    readFileSync(`${repositoryRoot}contracts/out/${name}.sol/${name}.json`, "utf8"),
  );
  if (
    !record(value) ||
    !Array.isArray(value.abi) ||
    !record(value.bytecode) ||
    typeof value.bytecode.object !== "string" ||
    !isHexString(value.bytecode.object)
  ) {
    throw new Error("Invalid compiled artifact");
  }
  return {
    abi: new Interface(JSON.stringify(value.abi)),
    bytecode: value.bytecode.object,
    bytecodeHash: keccak256(value.bytecode.object),
  };
}
