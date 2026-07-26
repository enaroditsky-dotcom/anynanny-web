import { Suspense } from "react";
import ParentCheckoutCompleteClient from "./complete-client";

export default function ParentCheckoutCompletePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#FDFBF6] p-6" dir="rtl">
          <p className="text-sm font-medium text-slate-600 animate-pulse">מסיימים את התשלום…</p>
        </main>
      }
    >
      <ParentCheckoutCompleteClient />
    </Suspense>
  );
}
