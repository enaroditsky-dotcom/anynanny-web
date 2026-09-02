import { PlayCircle } from "lucide-react";
import { personalAreaPathForRole, welcomeReplayHref } from "@/lib/charter/routing";
import type { ProfileRole } from "@/lib/supabase/profiles";

export function WelcomeReplayCard({ role }: { role: ProfileRole }) {
  return (
    <a
      href={welcomeReplayHref(role, personalAreaPathForRole(role))}
      className="flex items-center gap-3 rounded-2xl border border-[#001F3F]/10 bg-white p-4 text-right shadow-soft transition hover:bg-slate-50"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
        <PlayCircle className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-[#001F3F]">ברוכים הבאים ל-AnyNanny</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
          צפו שוב בסרטון ההיכרות של AnyNanny
        </span>
      </span>
    </a>
  );
}
