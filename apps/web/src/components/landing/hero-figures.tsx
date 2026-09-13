import { stateLanguage } from "@morrow/protocol";
import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ClaimAEvidence, ClaimASnapshot } from "@/lib/evidence/claim-a-snapshot";
import type { RecordedWithdrawal } from "@/lib/evidence/recorded-withdrawal";
import { transactionUrl, type ChainKey } from "@/lib/explorers";
import { saleAmounts, testTokenDecimals } from "@/lib/format/sale-amounts";
import { formatUnits } from "@/lib/format/token-units";

interface HeroFigure {
  readonly label: string;
  readonly value: string;
  readonly unit: "mSRC" | "mSET";
  readonly note: string;
  readonly chain: ChainKey;
  readonly transactionHash: string | undefined;
}

interface PayoutFigureInput {
  readonly withdrawal: RecordedWithdrawal | undefined;
  readonly paidLabel: string;
  readonly dueLabel: string;
  readonly dueValue: string;
  readonly paidNote: string;
}

function payoutFigure(input: PayoutFigureInput): HeroFigure {
  const { withdrawal } = input;
  return {
    label: withdrawal ? input.paidLabel : input.dueLabel,
    value: withdrawal ? formatUnits(withdrawal.amountRaw, testTokenDecimals) : input.dueValue,
    unit: "mSET",
    note: withdrawal ? input.paidNote : "Due at settlement",
    chain: "cc3",
    transactionHash: withdrawal?.transactionHash,
  };
}

function heroFigures(snapshot: ClaimASnapshot): readonly HeroFigure[] {
  const amounts = saleAmounts(snapshot.terms);
  const feeLabel = `Protocol fee · ${snapshot.terms.feeBps.toString()} bps`;
  return [
    {
      label: "Locked payout",
      value: amounts.faceValue,
      unit: "mSRC",
      note: "Sepolia funding tx",
      chain: "sepolia",
      transactionHash: snapshot.transactions.create,
    },
    {
      label: "Buyer paid early",
      value: amounts.grossPrice,
      unit: "mSET",
      note: "Creditcoin escrow tx",
      chain: "cc3",
      transactionHash: snapshot.transactions.fund,
    },
    payoutFigure({
      withdrawal: snapshot.withdrawals.fee,
      paidLabel: feeLabel,
      dueLabel: feeLabel,
      dueValue: amounts.fee,
      paidNote: "Fee withdrawal tx",
    }),
    payoutFigure({
      withdrawal: snapshot.withdrawals.seller,
      paidLabel: "Seller withdrew",
      dueLabel: "Seller net",
      dueValue: amounts.sellerNet,
      paidNote: "Seller withdrawal tx",
    }),
  ];
}

function FigureCell({ figure }: { figure: HeroFigure }) {
  return (
    <div className="flex flex-col items-center gap-2 bg-[#050505] px-4 py-6">
      <dt className="text-[10px] font-medium uppercase tracking-widest text-neutral-500">
        {figure.label}
      </dt>
      <dd className="font-mono text-xl text-white tabular-nums md:text-2xl">
        {figure.value}
        <span className="ml-1.5 text-xs text-neutral-500">{figure.unit}</span>
      </dd>
      <dd className="text-[11px] text-neutral-500">
        {figure.transactionHash ? (
          <a
            href={transactionUrl(figure.chain, figure.transactionHash)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 transition-colors hover:text-[#FF5A36]"
          >
            {figure.note}
            <HugeiconsIcon icon={ArrowUpRight01Icon} size={10} />
          </a>
        ) : (
          figure.note
        )}
      </dd>
    </div>
  );
}

export function HeroFigures({ evidence }: { evidence: ClaimAEvidence }) {
  return (
    <div className="animate-on-scroll [animation:fadeInUp_0.8s_ease-out_0.5s_both] animate mx-auto mt-16 max-w-4xl">
      {evidence.status === "available" ? (
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/5 bg-white/5 md:grid-cols-4">
          {heroFigures(evidence.snapshot).map((figure) => (
            <FigureCell key={figure.label} figure={figure} />
          ))}
        </dl>
      ) : (
        <div className="rounded-2xl border border-white/5 bg-[#050505] px-4 py-6 text-sm text-neutral-400">
          {stateLanguage.EVIDENCE_UNAVAILABLE} · {evidence.reason}
        </div>
      )}
      <p className="mt-4 text-[11px] text-neutral-500">
        Claim A, recorded on the Sepolia and Creditcoin CC3 testnets in test tokens.
      </p>
    </div>
  );
}
