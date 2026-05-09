"use client";

import Link from "next/link";
import { Eye } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isProfileRole, PROFILES_TABLE, type ProfileRole } from "@/lib/supabase/profiles";

async function ensureProfile(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
  input: { id: string; role: ProfileRole; full_name?: string | null }
) {
  const { data: existing } = await supabase.from(PROFILES_TABLE).select("id").eq("id", input.id).maybeSingle();
  if (existing) {
    const patch: Record<string, unknown> = { role: input.role };
    if (input.full_name !== undefined) patch.full_name = input.full_name;
    const { error } = await supabase.from(PROFILES_TABLE).update(patch).eq("id", input.id);
    if (error) console.warn("[auth] profiles update:", error.message);
    return;
  }
  const { error } = await supabase.from(PROFILES_TABLE).insert({
    id: input.id,
    role: input.role,
    full_name: input.full_name ?? null,
    balance: 0
  });
  if (error) console.warn("[auth] profiles insert:", error.message);
}

/** Prefer DB profile, then auth metadata, then signup-time role/name, then parent default. */
async function resolveRoleForUser(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
  user: { id: string; user_metadata?: Record<string, unknown> },
  signupRole?: ProfileRole,
  signupFullName?: string | null
): Promise<ProfileRole> {
  const { data: profile } = await supabase.from(PROFILES_TABLE).select("role").eq("id", user.id).maybeSingle();
  if (profile?.role && isProfileRole(profile.role)) {
    return profile.role;
  }

  const meta = user.user_metadata?.role;
  if (typeof meta === "string" && isProfileRole(meta)) {
    const fn =
      typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() || null : undefined;
    await ensureProfile(supabase, { id: user.id, role: meta, full_name: fn });
    return meta;
  }

  if (signupRole) {
    await ensureProfile(supabase, {
      id: user.id,
      role: signupRole,
      full_name: signupFullName !== undefined ? signupFullName : undefined
    });
    return signupRole;
  }

  await ensureProfile(supabase, { id: user.id, role: "parent" });
  return "parent";
}

function AuthPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next");
  const authError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<ProfileRole>("parent");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [passwordPeek, setPasswordPeek] = useState(false);

  const redirectAfterSignIn = (effectiveRole: ProfileRole) => {
    localStorage.setItem("active_role", effectiveRole);
    const allowedNext =
      nextPath &&
      ((effectiveRole === "parent" && nextPath.startsWith("/parent")) ||
        (effectiveRole === "sitter" && (nextPath === "/session" || nextPath.startsWith("/session/"))));
    if (allowedNext && nextPath) {
      router.replace(nextPath);
      return;
    }
    router.replace(effectiveRole === "parent" ? "/parent/dashboard" : "/session");
  };

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
        const trimmedName = fullName.trim();
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { role, full_name: trimmedName } }
        });
        if (error) {
          setMessage(`הרשמה נכשלה: ${error.message}`);
          return;
        }
        if (data.user) {
          await ensureProfile(supabase, {
            id: data.user.id,
            role,
            full_name: trimmedName || null
          });
        }
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session?.user) {
          const effective = await resolveRoleForUser(supabase, sessionData.session.user, role, trimmedName || null);
          redirectAfterSignIn(effective);
          return;
        }
        setMessage("נרשמת בהצלחה. אם נדרש אימות במייל — יש להשלים ואז להתחבר.");
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage(`התחברות נכשלה: ${error.message}`);
        return;
      }
      if (!data.user) {
        setMessage("לא התקבל משתמש מהשרת.");
        return;
      }

      const effective = await resolveRoleForUser(supabase, data.user);
      redirectAfterSignIn(effective);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-md space-y-4 py-2" dir="rtl">
      <section className="rounded-3xl bg-white p-5 shadow-soft">
        <h1 className="text-2xl font-bold text-navy-header">התחברות / הרשמה</h1>
        <p className="mt-1 text-sm text-slate-600">
          תפקיד נשמר בפרופיל במערכת. הורים נכנסים ללוח ההורים, בייביסיטר למסך המשמרת.
        </p>

        {authError === "no_profile" ? (
          <p className="mt-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
            חסר פרופיל למשתמש. נסו להתחבר שוב לאחר הרשמה, או פנו לתמיכה.
          </p>
        ) : null}

        <div className="mt-4 space-y-3">
          <label className="block text-sm text-navy-900">
            אימייל
            <input
              type="email"
              autoComplete="email"
              className="mt-1 block w-full rounded-lg border border-navy-header/20 p-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block text-sm text-navy-900">
            סיסמה
            <div className="relative mt-1">
              <input
                type={passwordPeek ? "text" : "password"}
                autoComplete={busy ? "off" : "current-password"}
                className="block w-full rounded-lg border border-navy-header/20 py-2 pl-2 pr-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                tabIndex={-1}
                aria-label="הצגת סיסמה זמנית"
                className={`absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 transition-colors ${
                  passwordPeek ? "text-[#001F3F]" : "text-navy-header/35 hover:text-navy-header/55"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setPasswordPeek(true);
                }}
                onMouseUp={() => setPasswordPeek(false)}
                onMouseLeave={() => setPasswordPeek(false)}
                onTouchStart={(e) => {
                  e.preventDefault();
                  setPasswordPeek(true);
                }}
                onTouchEnd={() => setPasswordPeek(false)}
                onTouchCancel={() => setPasswordPeek(false)}
              >
                <Eye className="h-5 w-5" strokeWidth={2} />
              </button>
            </div>
          </label>
          <label className="block text-sm text-navy-900">
            שם מלא (בהרשמה)
            <input
              type="text"
              autoComplete="name"
              className="mt-1 block w-full rounded-lg border border-navy-header/20 p-2"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="למשל: יעל כהן"
            />
          </label>
          <label className="block text-sm text-navy-900">
            תפקיד (בהרשמה)
            <select className="mt-1 block w-full rounded-lg border border-navy-header/20 p-2" value={role} onChange={(e) => setRole(e.target.value as ProfileRole)}>
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

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-md py-8 text-center text-sm text-slate-600" dir="rtl">
          טוען...
        </main>
      }
    >
      <AuthPageInner />
    </Suspense>
  );
}
