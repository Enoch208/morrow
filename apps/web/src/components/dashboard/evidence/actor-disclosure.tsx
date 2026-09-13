import { actors, type ActorRole } from "@/lib/chain/deployments";
import { addressUrl, chains } from "@/lib/explorers";
import { shortHex } from "@/lib/format/display";
import { actorRoleCopy } from "../actor-roles";

const roles = Object.keys(actors) as ActorRole[];

export function ActorDisclosure() {
  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-white/5 bg-[#0a0a0a] p-5 lg:p-6">
      <div className="flex max-w-2xl flex-col gap-1">
        <h3 className="text-base font-medium text-white">Who signed</h3>
        <p className="text-xs text-neutral-500">
          Every campaign claim uses three distinct testnet wallets, all operated by the Morrow team.
          The contracts enforce the roles, not the operator: only the current beneficiary can
          reserve, only the seller can assign, and a withdrawal pays only the calling wallet.
        </p>
      </div>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {roles.map((role) => (
          <li
            key={role}
            className="flex flex-col gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-4"
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-sm text-white">{actorRoleCopy[role].name}</span>
              <span className="text-[11px] text-neutral-500">{actorRoleCopy[role].duty}</span>
            </div>
            <span className="font-mono text-xs text-neutral-300">
              {shortHex(actors[role], 10, 8)}
            </span>
            <div className="flex gap-3 font-mono text-[10px] text-neutral-500">
              {(["sepolia", "cc3"] as const).map((chain) => (
                <a
                  key={chain}
                  href={addressUrl(chain, actors[role])}
                  target="_blank"
                  rel="noreferrer"
                  className="transition-colors hover:text-[#FF5A36]"
                >
                  {chains[chain].explorer}
                </a>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
