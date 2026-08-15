"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogoutButton } from "@/components/account/logout-button";
import { SitterPageShell } from "@/components/sitter/sitter-page-shell";
import { SitterPersonalArea } from "@/components/sitter/sitter-personal-area";
import { loadProductProfileOwnership } from "@/lib/auth/product-profiles";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SitterProfilePage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (!cancelled) setAuthReady(true);
        return;
      }

      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!user) {
        router.replace("/auth/login?next=/sitter/profile");
        return;
      }

      const ownership = await loadProductProfileOwnership(supabase, user.id);

      if (cancelled) return;

      if (!ownership?.hasSitter) {
        router.replace("/auth/role-mismatch?requested=sitter");
        return;
      }

      setUserId(user.id);
      setAuthReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <SitterPageShell
      title="אזור אישי"
      subtitle="כל פרטי השאלון והפרופיל המקצועי — ניתן לערוך ולשמור בכל עת."
    >
      {authReady ? <SitterPersonalArea userId={userId} /> : null}
      {authReady ? (
        <div className="mt-4 shrink-0 border-t border-slate-100 pt-4">
          <LogoutButton />
        </div>
      ) : null}
    </SitterPageShell>
  );
}
