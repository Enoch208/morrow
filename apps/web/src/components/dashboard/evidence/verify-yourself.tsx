import { repositoryUrl } from "@/lib/explorers";

const commands = [
  `git clone ${repositoryUrl}.git && cd morrow`,
  "pnpm install --frozen-lockfile",
  "forge build --root contracts",
  "pnpm verify:submission",
] as const;

const coverage = [
  "Deployed runtime against compiled artifacts, immutables masked",
  "Dispatcher selectors against the ABI, no upgrade or destroy opcodes",
  "Amounts, identities and native proofs recomputed from chain data",
  "Withdrawals, beneficiary, refusals and market liabilities",
] as const;

const exitCodes = [
  { code: "0", meaning: "VERIFIED · every check passed" },
  { code: "1", meaning: "FAILED · at least one check contradicts the chain" },
  { code: "2", meaning: "UNVERIFIED · evidence missing or unavailable, none failed" },
] as const;

export function VerifyYourself() {
  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-[#FF5A36]/20 bg-[#0a0a0a] p-5 lg:p-6">
      <div className="flex max-w-2xl flex-col gap-1">
        <h3 className="text-base font-medium text-white">Verify it yourself, without this page</h3>
        <p className="text-xs text-neutral-500">
          An independent, keyless command re-reads Sepolia and Creditcoin and prints PASS, FAIL or
          UNVERIFIED for the contracts, the claims and the refusals on this page. It shares no code
          with this dashboard and needs no wallet. Public RPC history can take several minutes.
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/5 bg-black px-4 py-3">
        <pre className="font-mono text-xs leading-relaxed text-neutral-200">
          {commands.map((command) => `$ ${command}`).join("\n")}
        </pre>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ul className="flex flex-col gap-1.5">
          {coverage.map((line) => (
            <li key={line} className="text-xs text-neutral-400">
              {line}
            </li>
          ))}
        </ul>
        <dl className="flex flex-col gap-1.5">
          {exitCodes.map(({ code, meaning }) => (
            <div key={code} className="flex gap-3 font-mono text-xs">
              <dt className="text-neutral-500">exit {code}</dt>
              <dd className="text-neutral-300">{meaning}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
