"use client";

type BillingSessionMetricsProps = {
  timerText: string;
  accruedNis: string;
  ratePerMinute: number;
  isLive: boolean;
  headline?: string;
};

export function BillingSessionMetrics({
  timerText,
  accruedNis,
  ratePerMinute,
  isLive,
  headline = "משמרת פעילה"
}: BillingSessionMetricsProps) {
  return (
    <div className="w-full shrink-0 space-y-3 text-right">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${
            isLive
              ? "bg-emerald-50 text-emerald-800 ring-emerald-200/80"
              : "bg-amber-50 text-amber-900 ring-amber-200/80"
          }`}
        >
          {headline}
        </span>
        <span className="text-xs font-medium tabular-nums text-slate-600">
          ₪{ratePerMinute.toFixed(2)}/דקה
        </span>
      </div>

      <p className="text-4xl font-bold tabular-nums tracking-wide text-[#001F3F]">{timerText}</p>

      <div className="rounded-2xl border border-navy-header/10 bg-[#FDFBF6]/80 px-4 py-3 shadow-sm">
        <p className="text-xs font-semibold text-navy-800/70">סכום שנצבר</p>
        <p className="text-2xl font-bold tabular-nums text-[#001F3F]">₪{accruedNis}</p>
      </div>
    </div>
  );
}
