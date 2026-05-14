import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, Calendar, Star } from "lucide-react";
import type { PublicSitterReview, SitterProfilePublic } from "@/lib/sitter/sitter-profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isProfileRole, PROFILES_TABLE } from "@/lib/supabase/profiles";

function parseReviews(raw: unknown): PublicSitterReview[] {
  if (!Array.isArray(raw)) return [];
  return raw as PublicSitterReview[];
}

function formatAvg(avg: number | null | undefined, count: number | null | undefined): string {
  const c = count ?? 0;
  if (c <= 0 || avg == null) return "אין דירוג עדיין";
  return `${Number(avg).toFixed(1)} ★ (${c} ביקורות)`;
}

export default async function ParentSitterProfilePage({ params }: { params: Promise<{ sitterId: string }> }) {
  const { sitterId: rawId } = await params;
  const sitterId = decodeURIComponent(rawId).trim();
  if (!sitterId) notFound();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    redirect(`/auth/login?next=${encodeURIComponent(`/parent/sitter/${sitterId}`)}`);
  }

  const { data: roleRow } = await supabase.from(PROFILES_TABLE).select("role").eq("id", user.id).maybeSingle();
  if (!isProfileRole(roleRow?.role) || roleRow.role !== "parent") {
    redirect("/parent/dashboard");
  }

  const [{ data: profileJson, error: profErr }, { data: reviewsRaw, error: revErr }] = await Promise.all([
    supabase.rpc("get_sitter_profile_public", { target_id: sitterId }),
    supabase.rpc("get_sitter_public_reviews", { p_sitter_id: sitterId, p_limit: 3 })
  ]);

  if (profErr) {
    console.error("[parent sitter profile] rpc profile", profErr.message);
    notFound();
  }

  if (profileJson == null) {
    notFound();
  }

  if (revErr) {
    console.warn("[parent sitter profile] rpc reviews", revErr.message);
  }

  const profile = profileJson as SitterProfilePublic;
  const reviews = parseReviews(reviewsRaw);
  const displayName = profile.display_name?.trim() || "בייביסיטר";

  return (
    <main className="mx-auto min-h-[calc(100dvh-6rem)] w-full max-w-md space-y-5 bg-[#FDFBF6] py-3 pb-24" dir="rtl">
      <div className="flex items-center justify-between px-1">
        <Link
          href="/parent/search"
          className="inline-flex items-center gap-1 rounded-full border border-navy-header/20 bg-white px-3 py-1.5 text-xs font-semibold text-navy-header shadow-sm transition hover:bg-brand-cream"
        >
          <ArrowRight className="h-4 w-4" />
          חזרה לחיפוש
        </Link>
        <h1 className="text-lg font-bold text-navy-header">פרופיל</h1>
      </div>

      <section className="mx-1 rounded-3xl border border-navy-header/12 bg-white p-5 shadow-soft">
        <div className="flex flex-row-reverse items-start justify-between gap-3">
          <div className="min-w-0 flex-1 text-right">
            <h2 className="text-xl font-bold text-[#001F3F]">{displayName}</h2>
            {profile.years_experience != null ? (
              <p className="mt-1 text-sm text-slate-600">{profile.years_experience} שנות ניסיון</p>
            ) : null}
            {profile.hourly_rate_nis != null ? (
              <p className="mt-2 text-base font-semibold text-navy-800">₪{Number(profile.hourly_rate_nis).toFixed(0)} לשעה</p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-center gap-1 rounded-2xl bg-amber-50 px-3 py-2 ring-1 ring-amber-200/80">
            <Star className="h-6 w-6 fill-amber-400 text-amber-500" aria-hidden />
            <span className="text-center text-sm font-bold tabular-nums leading-tight text-amber-950">
              {formatAvg(profile.avg_rating, profile.rating_count)}
            </span>
          </div>
        </div>

        {profile.bio ? (
          <div className="mt-4 border-t border-navy-header/10 pt-4">
            <p className="text-right text-sm font-semibold text-navy-header">אודות</p>
            <p className="mt-2 whitespace-pre-wrap text-right text-sm leading-relaxed text-slate-700">{profile.bio}</p>
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <Link
            href={`/parent/sitter/${encodeURIComponent(sitterId)}/calendar`}
            className="inline-flex flex-row-reverse items-center justify-center gap-2 rounded-2xl bg-[#001F3F] px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:brightness-110"
          >
            <Calendar className="h-4 w-4" aria-hidden />
            זמינות ויומן
          </Link>
        </div>
      </section>

      <section className="mx-1 rounded-3xl border border-navy-header/12 bg-white p-5 shadow-soft">
        <h3 className="text-right text-base font-bold text-[#001F3F]">מה הורים כתבו לאחרונה</h3>
        <p className="mt-1 text-right text-xs text-slate-500">עד 3 תגובות אחרונות עם טקסט (ללא שמות — פרטיות).</p>

        {reviews.length === 0 ? (
          <p className="mt-4 text-right text-sm text-slate-600">עדיין אין הערות טקסט ציבוריות להצגה.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {reviews.map((r, i) => (
              <li key={`${r.created_at}-${i}`} className="rounded-2xl border border-navy-header/8 bg-[#FDFBF6]/80 p-3 text-right">
                <div className="flex flex-row-reverse items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-amber-800">
                    {r.rating} <span className="text-amber-500">★</span>
                  </span>
                  <time className="text-xs text-slate-500" dateTime={r.created_at}>
                    {new Date(r.created_at).toLocaleDateString("he-IL", { dateStyle: "medium" })}
                  </time>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-800">{r.comment}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
