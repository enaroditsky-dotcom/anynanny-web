"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { upsertProfileOnSignup } from "@/lib/auth/supabase-profile";
import { isProfileRole, type ProfileRole } from "@/lib/supabase/profiles";

const SUPABASE_URL = "https://dqycvddpdhxawdgdatfe.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxeWN2ZGRwZGh4YXdkZ2RhdGZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNDMzNTEsImV4cCI6MjA5MzgxOTM1MX0.1nIMudhzgs1j41tzA4VhtEQjdIhztFWMmDoFU1G69-I";

const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ROLE_LABELS: Record<ProfileRole, string> = {
  parent: "הורה",
  sitter: "נני",
};

function RegisterInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const role = useMemo((): ProfileRole | null => {
    const value = searchParams.get("role");
    return value === "parent" || value === "sitter" ? value : null;
  }, [searchParams]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!role) {
      setErrorMsg("לא נבחר תפקיד. חזרו לדף הבית ובחרו הורה או נני.");
      return;
    }
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password) {
      setErrorMsg("נא למלא את כל השדות.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            role,
            first_name: trimmedFirst,
            last_name: trimmedLast,
          },
        },
      });

      if (error) throw error;

      if (data.user) {
        const profileResult = await upsertProfileOnSignup(supabase, {
          id: data.user.id,
          role,
          first_name: trimmedFirst,
          last_name: trimmedLast,
        });
        if (profileResult.error) {
          console.warn("[register] profile upsert:", profileResult.error);
        }
      }

      alert("ההרשמה הצליחה! נא לאשר את האימייל שנשלח אליך.");
      router.push("/");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "לא ניתן להשלים את ההרשמה";
      console.error("שגיאת הרשמה:", err);
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  if (!role) {
    return (
      <main className="mx-auto max-w-md p-8" dir="rtl">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-right shadow-sm">
          <h1 className="text-xl font-bold text-navy-header">לא נבחר תפקיד</h1>
          <p className="mt-2 text-sm text-slate-600">
            יש לבחור הורה או נני בדף הבית לפני ההרשמה.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block text-sm font-semibold text-navy-header underline decoration-navy-header/30"
          >
            חזרה לדף הבית
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-8" dir="rtl">
      <button
        type="button"
        onClick={() => router.push("/")}
        className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-navy-header"
      >
        ← חזרה
      </button>

      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <header className="mb-6 text-right">
          <h1 className="text-2xl font-bold text-navy-header">יצירת חשבון</h1>
          <p className="mt-1 text-sm text-slate-600">הרשמה כ{ROLE_LABELS[role]}</p>
        </header>

        {errorMsg ? (
          <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{errorMsg}</p>
        ) : null}

        <form onSubmit={handleRegister} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              required
              placeholder="שם פרטי"
              className="w-full rounded-xl border border-slate-200 p-3 outline-none focus:border-navy-header"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
            />
            <input
              type="text"
              required
              placeholder="שם משפחה"
              className="w-full rounded-xl border border-slate-200 p-3 outline-none focus:border-navy-header"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
            />
          </div>

          <input
            type="email"
            required
            placeholder="אימייל"
            className="w-full rounded-xl border border-slate-200 p-3 outline-none focus:border-navy-header"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <input
            type="password"
            required
            placeholder="סיסמה"
            className="w-full rounded-xl border border-slate-200 p-3 outline-none focus:border-navy-header"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full cursor-pointer rounded-xl bg-navy-header py-4 font-bold text-white transition-colors hover:bg-blue-900 disabled:opacity-50"
          >
            {loading ? "מבצע הרשמה..." : "אישור והמשך"}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center">טוען...</div>}>
      <RegisterInner />
    </Suspense>
  );
}
