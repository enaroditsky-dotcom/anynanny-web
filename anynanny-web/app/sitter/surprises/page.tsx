import Image from "next/image";
import { Gift, Heart, Sparkles } from "lucide-react";
import { SitterPageShell } from "@/components/sitter/sitter-page-shell";

const CARD_CLASS =
  "rounded-3xl border border-slate-200/60 bg-white p-4 text-right shadow-soft";

const ICON_WRAP_CLASS =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-navy-header/10";

const BADGE_CLASS =
  "inline-flex shrink-0 rounded-md border border-amber-200/70 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800";

function ComingSoonBadge() {
  return <span className={BADGE_CLASS}>בקרוב</span>;
}

export default function SitterSurprisesPage() {
  return (
    <SitterPageShell title="הפתעות">
      <div className="space-y-5 pb-6">
        <section className={`${CARD_CLASS} px-5 py-6`}>
          <div className="flex justify-center">
            <Image
              src="/sitter-surprises-button.png"
              alt=""
              width={1282}
              height={1227}
              sizes="128px"
              priority
              className="h-32 w-32 object-contain"
            />
          </div>
          <h2 className="mt-4 text-center text-lg font-bold text-navy-header">ההפתעה של השבוע</h2>
          <p className="mt-1 text-center text-sm text-slate-600">משהו חדש מחכה לך 🎁</p>
        </section>

        <header className="space-y-1 px-1">
          <h2 className="text-right text-base font-bold text-navy-header">הפתעות בשבילך</h2>
          <p className="text-right text-sm leading-relaxed text-slate-600">
            הטבות, מתנות ודברים טובים במיוחד לקהילת הנניז של AnyNanny
          </p>
        </header>

        <div className="space-y-3">
          <article className={CARD_CLASS}>
            <div className="flex items-start justify-between gap-3">
              <span className={`${ICON_WRAP_CLASS} text-emerald-600`}>
                <Gift className="h-6 w-6 stroke-[1.75]" aria-hidden />
              </span>
              <ComingSoonBadge />
            </div>
            <h3 className="mt-3 text-sm font-bold text-navy-header">הפתעת השבוע</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">בקרוב תחכה לך כאן הפתעה חדשה.</p>
          </article>

          <article className={CARD_CLASS}>
            <div className="flex items-start justify-between gap-3">
              <span className={`${ICON_WRAP_CLASS} text-emerald-600`}>
                <Sparkles className="h-6 w-6 stroke-[1.75]" aria-hidden />
              </span>
              <ComingSoonBadge />
            </div>
            <h3 className="mt-3 text-sm font-bold text-navy-header">צוברים הפתעות</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              פעילות ב־AnyNanny תוכל לזכות אותך בהטבות, מתנות והפתעות.
            </p>
          </article>

          <article className={CARD_CLASS}>
            <div className="flex items-start justify-between gap-3">
              <span className={`${ICON_WRAP_CLASS} text-[#9F1239]`}>
                <Heart className="h-6 w-6 stroke-[1.75]" aria-hidden />
              </span>
              <ComingSoonBadge />
            </div>
            <h3 className="mt-3 text-sm font-bold text-navy-header">הטבות לנניז</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              אנחנו עובדים על הטבות מיוחדות רק לקהילת הנניז שלנו.
            </p>
          </article>
        </div>
      </div>
    </SitterPageShell>
  );
}
