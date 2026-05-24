"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SitterPageShell } from "@/components/sitter/sitter-page-shell";
import { SitterProfileForm } from "@/components/sitter/sitter-profile-form";
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

      setUserId(user.id);
      setAuthReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <SitterPageShell
      title="פרופיל מקצועי"
      subtitle="עדכון אזורי השירות שלך — ההורים יראו אותך בחיפוש לפי הערים שבחרת."
    >
      {authReady ? <SitterProfileForm userId={userId} /> : null}
    </SitterPageShell>
  );
}
