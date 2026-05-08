"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Role = "parent" | "sitter";

export default function AuthPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("parent");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const handleAuth = async (mode: "signin" | "signup") => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase לא מוגדר. יש לעדכן מפתחות סביבה.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { role } }
        });
        if (error) {
          setMessage(`הרשמה נכשלה: ${error.message}`);
          return;
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setMessage(`התחברות נכשלה: ${error.message}`);
          return;
        }
        const userRole = (data.user.user_metadata.role as Role | undefined) ?? role;
        localStorage.setItem("active_role", userRole);
        router.replace(userRole === "parent" ? "/parent/dashboard" : "/session");
      }
      setMessage(mode === "signup" ? "נרשמת בהצלחה. כעת ניתן להתחבר." : "התחברת בהצלחה.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-md space-y-4 py-2" dir="rtl">
      <section className="rounded-3xl bg-white p-5 shadow-soft">
        <h1 className="text-2xl font-bold text-navy-header">התחברות / הרשמה</h1>
        <p className="mt-1 text-sm text-slate-600">החשבון משויך לתפקיד הורה או בייביסיטר.</p>

        <div className="mt-4 space-y-3">
          <label className="block text-sm text-navy-900">
            אימייל
            <input
              type="email"
              className="mt-1 block w-full rounded-lg border border-navy-header/20 p-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block text-sm text-navy-900">
            סיסמה
            <input
              type="password"
              className="mt-1 block w-full rounded-lg border border-navy-header/20 p-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="block text-sm text-navy-900">
            תפקיד
            <select className="mt-1 block w-full rounded-lg border border-navy-header/20 p-2" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="parent">הורה</option>
              <option value="sitter">בייביסיטר</option>
            </select>
          </label>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleAuth("signin")}
            className="flex-1 rounded-xl bg-[#001F3F] px-4 py-2 text-sm font-semibold text-white"
          >
            התחברות
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleAuth("signup")}
            className="flex-1 rounded-xl border border-navy-header/25 bg-white px-4 py-2 text-sm font-semibold text-navy-header"
          >
            הרשמה
          </button>
        </div>

        {message ? <p className="mt-3 text-sm text-slate-700">{message}</p> : null}
      </section>

      <Link href="/?manual=true" className="inline-flex text-sm font-semibold text-navy-header underline">
        חזרה למסך הבית
      </Link>
    </main>
  );
}
