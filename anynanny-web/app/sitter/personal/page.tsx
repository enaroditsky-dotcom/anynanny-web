"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy shortcut — personal area lives on `/sitter/profile`. */
export default function SitterPersonalRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/sitter/profile");
  }, [router]);

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-md items-center justify-center bg-[#FDFBF6] text-sm text-slate-500" dir="rtl">
      מעביר לאזור האישי…
    </main>
  );
}
