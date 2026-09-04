"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

const ALLOWED_NEXT = new Set([
  "/parent/profile",
  "/parent/dashboard",
  "/parent/onboarding",
  "/sitter/profile",
  "/sitter/dashboard",
  "/sitter/onboarding"
]);

function sanitizeNext(role: string, raw: string | null): string {
  const value = String(raw ?? "").trim();
  if (ALLOWED_NEXT.has(value)) return value;
  return role === "sitter" ? "/sitter/profile" : "/parent/profile";
}

function VerifyDoneInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const started = useRef(false);
  const [message] = useState("מחזירים אתכם לאפליקציה…");

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const role = searchParams.get("role") === "sitter" ? "sitter" : "parent";
    const next = sanitizeNext(role, searchParams.get("next"));
    const timer = window.setTimeout(() => {
      router.replace(next);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [router, searchParams]);

  return (
    <main
      className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-md flex-col items-center justify-center gap-3 bg-[#FDFBF6] px-4 text-sm text-slate-600"
      dir="rtl"
    >
      <Loader2 className="h-5 w-5 animate-spin text-[#001F3F]" aria-hidden />
      <p>{message}</p>
      <p className="text-center text-xs text-slate-500">
        סטטוס האימות מתעדכן בשרת לאחר קבלת ההחלטה. זה אינו אישור שהזהות אומתה.
      </p>
    </main>
  );
}

export default function VerifyDonePage() {
  return (
    <Suspense
      fallback={
        <main
          className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-md items-center justify-center bg-[#FDFBF6] text-sm text-slate-500"
          dir="rtl"
        >
          טוען…
        </main>
      }
    >
      <VerifyDoneInner />
    </Suspense>
  );
}
