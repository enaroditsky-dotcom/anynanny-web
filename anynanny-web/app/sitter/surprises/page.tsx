import { SitterPageShell } from "@/components/sitter/sitter-page-shell";

/** Placeholder destination for the Sitter center-nav surprises slot. */
export default function SitterSurprisesPage() {
  return (
    <SitterPageShell title="הפתעות">
      <div className="rounded-3xl border border-slate-200/60 bg-white p-6 text-right shadow-soft">
        <p className="text-sm leading-relaxed text-slate-600">
          בקרוב יחכו כאן הפתעות, הטבות ומתנות במיוחד בשבילך.
        </p>
      </div>
    </SitterPageShell>
  );
}
