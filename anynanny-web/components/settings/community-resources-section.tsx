import { BookOpen, PlayCircle } from "lucide-react";
import { getCharterDocument } from "@/lib/charter/content";
import { charterFullHref, welcomeHref } from "@/lib/charter/routing";
import type { ProfileRole } from "@/lib/supabase/profiles";

export function CommunityResourcesSection({ role }: { role: ProfileRole }) {
  const charter = getCharterDocument(role);
  const settingsPath = role === "parent" ? "/parent/settings" : "/sitter/settings";

  return (
    <div className="mt-6 rounded-3xl border border-slate-200/60 bg-white p-4 shadow-soft space-y-3 text-right">
      <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">קהילת AnyNanny</h2>

      <a
        href={welcomeHref(role, "replay")}
        className="flex items-center justify-between rounded-xl p-2.5 transition hover:bg-slate-50"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
            <PlayCircle className="h-4 w-4" />
          </div>
          <span className="text-sm font-bold text-slate-700">ברוכים הבאים ל-AnyNanny</span>
        </div>
      </a>

      <a
        href={charterFullHref(role, settingsPath)}
        className="flex items-center justify-between rounded-xl border-t border-slate-100 p-2.5 transition hover:bg-slate-50"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
            <BookOpen className="h-4 w-4" />
          </div>
          <span className="text-sm font-bold text-slate-700">{charter.title}</span>
        </div>
      </a>
    </div>
  );
}
