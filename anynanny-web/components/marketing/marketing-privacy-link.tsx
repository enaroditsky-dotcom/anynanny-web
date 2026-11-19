/**
 * Accessible Privacy Policy link for public marketing pages.
 * Relative `/privacy` stays on the current host. Production sends
 * `app.anynanny.org/privacy` to the canonical `https://www.anynanny.org/privacy`.
 */
export function MarketingPrivacyLink({ compact = false }: { compact?: boolean }) {
  return (
    <nav
      aria-label="מדיניות פרטיות"
      className={compact ? "pb-1 text-center" : "px-4 py-6 text-center"}
      dir="rtl"
    >
      <a
        href="/privacy"
        className="inline-flex min-h-11 items-center text-sm font-semibold text-[#001F3F] underline decoration-[#001F3F]/30 underline-offset-4"
      >
        מדיניות פרטיות
      </a>
    </nav>
  );
}
