export function PhoneAmountScreen({
  eyebrow,
  amount,
  unit,
  accent = false,
}: {
  eyebrow: string;
  amount: string;
  unit: string;
  accent?: boolean;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[3cqh] px-[8cqw] text-center">
      <span className="font-mono text-[7cqw] uppercase tracking-widest text-neutral-500">
        {eyebrow}
      </span>
      <span
        className={`text-[15cqw] font-medium tracking-tight ${accent ? "text-[#FF5A36]" : "text-white"}`}
      >
        {amount}
      </span>
      <span className="font-mono text-[7cqw] text-neutral-400">{unit}</span>
    </div>
  );
}
