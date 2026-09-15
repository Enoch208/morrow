import { ConfigurationError, repositoryRoot } from "./environment.ts";

export function runDirectory(journal: string, argv: readonly string[]): string {
  const flag = argv.find((argument) => argument.startsWith("--run="));
  if (flag === undefined) return `${repositoryRoot}evidence/${journal}`;
  const run = flag.slice("--run=".length);
  if (!/^[a-z0-9-]{1,32}$/.test(run)) throw new ConfigurationError("Run names use a-z, 0-9 and -");
  return `${repositoryRoot}evidence/${journal}/${run}`;
}
