export function OnboardingUnavailablePanel({
  phase,
  onRetry
}: {
  phase: "loading" | "error";
  onRetry: () => void;
}) {
  if (phase === "loading") {
    return (
      <main className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col items-center justify-center px-4 py-10" dir="rtl">
        <p className="text-center text-sm text-slate-600">בודקים את החשבון…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col items-center justify-center px-4 py-10" dir="rtl">
      <section className="w-full rounded-3xl bg-white p-6 shadow-soft">
        <h1 className="text-center text-2xl font-bold text-navy-header">לא הצלחנו לטעון את החשבון</h1>
        <p className="mt-3 text-center text-sm leading-relaxed text-slate-600">
          יש בעיה זמנית בחיבור לשרת. אפשר לנסות שוב בעוד רגע.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 w-full rounded-2xl bg-[#001F3F] py-3 font-bold text-white"
        >
          נסו שוב
        </button>
      </section>
    </main>
  );
}
