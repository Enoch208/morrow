import type { ChainKey } from "@/lib/explorers";
import { transactionUrl } from "@/lib/explorers";
import { shortHex } from "@/lib/format/display";
import type { ActionState } from "./use-wallet-action";

export function ActionStatus({ state, chain }: { state: ActionState; chain: ChainKey }) {
  switch (state.phase) {
    case "idle":
      return null;
    case "preparing":
      return <p className="text-[11px] text-neutral-400">Checking live chain state…</p>;
    case "signing":
      return <p className="text-[11px] text-neutral-400">Confirm in your wallet…</p>;
    case "confirming":
      return (
        <p className="text-[11px] text-neutral-400">
          Mined · re-reading chain state · {shortHex(state.hash)}
        </p>
      );
    case "skipped":
      return <p className="text-[11px] text-neutral-400">{state.note}</p>;
    case "done":
      return (
        <a
          href={transactionUrl(chain, state.hash)}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-green-500 hover:underline"
        >
          Confirmed on chain · {shortHex(state.hash)}
        </a>
      );
    case "refused":
      return <p className="text-[11px] text-neutral-400">Not allowed yet: {state.reason}</p>;
    case "failed":
      return (
        <p className="text-[11px] text-[#FF5A36]">
          {state.reason}
          {state.hash && (
            <>
              {" · "}
              <a
                href={transactionUrl(chain, state.hash)}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {shortHex(state.hash)}
              </a>
            </>
          )}
        </p>
      );
  }
}

export function ActionButton({
  label,
  onClick,
  disabled,
  primary = false,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        primary
          ? "rounded-full bg-white px-4 py-2 text-xs font-medium text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-neutral-500"
          : "rounded-full border border-white/10 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
      }
    >
      {label}
    </button>
  );
}
