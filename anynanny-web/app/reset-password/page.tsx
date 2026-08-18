"use client";

import { useEffect } from "react";

/** Preserves hash tokens if an older recovery email still points at `/reset-password`. */
export default function LegacyResetPasswordRedirect() {
  useEffect(() => {
    const { search, hash } = window.location;
    window.location.replace(`/auth/reset-password${search}${hash}`);
  }, []);

  return (
    <main className="mx-auto max-w-md py-10 text-center text-sm text-slate-600" dir="rtl">
      מעבירים לאיפוס סיסמה…
    </main>
  );
}
