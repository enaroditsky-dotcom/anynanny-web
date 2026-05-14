import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Star } from "lucide-react";
import type { PublicSitterSearchCard } from "@/lib/sitter/sitter-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isProfileRole, PROFILES_TABLE } from "@/lib/supabase/profiles";

function parseSearchCards(raw: unknown): PublicSitterSearchCard[] {
  if (!Array.isArray(raw)) return [];
  return raw as PublicSitterSearchCard[];
}

function formatAvgLine(avg: number | null, count: number): string {
  if (count <= 0 || avg == null) return "אין דירוג עדיין";
  return `${Number(avg).toFixed(1)} ★ (${count})`;
}

function bioExcerpt(text: string | null, max = 120): string {
  if (!text) return "";
  const t = text.trim();
  if (!t) return "";
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export default async function ParentSearchPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    redirect("/auth/login?next=/parent/search");
  }

  const { data: roleRow } = await supabase.from(PROFILES_TABLE).select("role").eq("id", user.id).maybeSingle();
  if (!isProfileRole(roleRow?.role) || roleRow.role !== "parent") {
    redirect("/parent/dashboard");
  }

  const { data: rawList, error: listErr } = await supabase.rpc("list_public_sitters_search");
  const sitters = listErr ? [] : parseSearchCards(rawList);

  return (
    <main className="mx-auto w-full max-w-md space-y-4 bg-[#FDFBF6] py-2 pb-24" dir="rtl">
      <div className="flex items-center justify-between px-1">
        <Link
          href="/parent/dashboard"
          className="inline-flex items-center gap-1 rounded-full border border-navy-header/20 bg-white px-3 py-1.5 text-xs font-semibold text-navy-header shadow-sm transition hover:bg-brand-cream"
        >
          <ArrowRight className="h-4 w-4" />
          חזרה לדשבורד
        </Link>
        <h1 className="text-lg font-bold text-navy-header">חיפוש נני</h1>
      </div>

      {listErr ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-right text-sm text-amber-950">
          לא ניתן לטעון רשימה ({listErr.message}). ודאו שהמיגרציה `list_public_sitters_search` הורצה ב-Supabase.
        </p>
      ) : null}

      <p className="px-1 text-right text-xs text-slate-600">
        ממוינים לפי דירוג ממוצע (גבוה קודם) — כדי לעודד שירות מצוין.
      </p>

      <section className="space-y-3 px-1">
        {sitters.length === 0 && !listErr ? (
          <div className="rounded-3xl border border-navy-header/10 bg-white p-6 text-center text-sm text-slate-600 shadow-soft">
            אין כרגע בייביסיטרים מוצגים לחיפוש. כשסיטרים יסיימו פרופיל ציבורי — יופיעו כאן.
          </div>
        ) : null}

        {sitters.map((s) => {
          const name = s.display_name?.trim() || "בייביסיטר";
          const rate = s.hourly_rate_nis != null ? `₪${Number(s.hourly_rate_nis).toFixed(0)}` : "—";
          const exp = s.years_experience != null ? `${s.years_experience} שנות ניסיון` : "";
          return (
            <Link
              key={s.id}
              href={`/parent/sitter/${encodeURIComponent(s.id)}`}
              className="block rounded-3xl border border-navy-header/12 bg-white p-4 shadow-soft transition hover:border-navy-header/25 hover:shadow-md active:scale-[0.99]"
            >
              <div className="flex flex-row-reverse items-start justify-between gap-3">
                <div className="min-w-0 flex-1 text-right">
                  <p className="text-base font-bold text-[#001F3F]">{name}</p>
                  {exp ? <p className="mt-0.5 text-xs text-slate-600">{exp}</p> : null}
                  <p className="mt-1 line-clamp-3 text-sm leading-snug text-slate-700">{bioExcerpt(s.bio) || "—"}</p>
                  <p className="mt-2 text-sm font-semibold text-navy-800">{rate} לשעה</p>
                </div>
                <div className="flex shrink-0 flex-col items-center gap-0.5 rounded-2xl bg-amber-50 px-3 py-2 ring-1 ring-amber-200/80">
                  <Star className="h-5 w-5 fill-amber-400 text-amber-500" aria-hidden />
                  <span className="text-sm font-bold tabular-nums text-amber-950">
                    {formatAvgLine(s.avg_rating, s.rating_count)}
                  </span>
                </div>
              </div>
              <p className="mt-3 text-right text-xs font-semibold text-emerald-700">פרופיל וחוות דעת ←</p>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
