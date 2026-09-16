"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Baby, ChevronDown, ChevronUp, Users } from "lucide-react";
import {
  getParentOnboardingGateRedirect,
  getSitterOnboardingGateRedirect
} from "@/lib/auth/post-auth-destination";
import { loadProductProfileOwnership, roleMismatchHref } from "@/lib/auth/product-profiles";
import { HomepageWelcomeVideo } from "@/components/welcome/homepage-welcome-video";
import { AnyNannyLogo } from "@/components/brand/anynanny-logo";
import { AnynannyMascotPortrait } from "@/components/brand/anynanny-mascot-portrait";
import { PAGE_BACK_NAV_CLASS, PageBackRow } from "@/components/navigation/page-back-link";
import { welcomeSignupHref } from "@/lib/charter/routing";
import { setUserRoleChoice } from "@/lib/auth/returning-user";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  APP_DOWNLOAD_HEADING,
  STORE_DOWNLOADS,
  STORE_DOWNLOAD_SOON_LABEL,
  verifiedStoreHref,
  type StorePlatformId
} from "@/lib/app/store-downloads";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type LandingPath = "parent" | "sitter";

function PathIcon({ path }: { path: LandingPath }) {
  if (path === "parent") {
    return <Users className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />;
  }

  return <Baby className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />;
}

const PATHS: Array<{
  id: LandingPath;
  title: string;
  subtitle: string;
  accent: string;
  iconWrap: string;
}> = [
  {
    id: "parent",
    title: "הורים",
    subtitle: "חיפוש בייביסיטר",
    accent: "border-[#FF8A8A]/35 bg-[#FF8A8A]/10 text-[#C45C5C]",
    iconWrap: "bg-[#FF8A8A]/15 text-[#FF8A8A] ring-[#FF8A8A]/25"
  },
  {
    id: "sitter",
    title: "בייביסיטר",
    subtitle: "קבלת משמרות ועבודה",
    accent: "border-navy-header/20 bg-[#001F3F]/5 text-navy-header",
    iconWrap: "bg-[#001F3F]/10 text-navy-header ring-navy-header/15"
  }
];

function AppLoginLandingInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isManual = searchParams.get("manual") === "true";
  const [registrationOpen, setRegistrationOpen] = useState(false);

  useEffect(() => {
    if (isManual) return;

    try {
      const activeRole = localStorage.getItem("active_role");

      if (activeRole === "parent" || activeRole === "sitter") {
        void (async () => {
          const supabase = getSupabaseBrowserClient();
          if (!supabase) return;
          const {
            data: { user }
          } = await supabase.auth.getUser();
          if (!user) return;
          const ownership = await loadProductProfileOwnership(supabase, user.id);
          if (activeRole === "parent") {
            if (!ownership?.hasParent) {
              router.replace(roleMismatchHref("parent"));
              return;
            }
            const dest = await getParentOnboardingGateRedirect(supabase, user.id, "/parent/dashboard");
            router.replace(dest ?? "/parent/dashboard");
            return;
          }
          if (!ownership?.hasSitter) {
            router.replace(roleMismatchHref("sitter"));
            return;
          }
          const dest = await getSitterOnboardingGateRedirect(supabase, user.id, "/sitter/dashboard");
          router.replace(dest ?? "/sitter/dashboard");
        })();
      }
    } catch {
      /* ignore */
    }
  }, [isManual, router, searchParams]);

  const navigateWithPath = (action: "login" | "register", path: LandingPath) => {
    const profileRole = path === "parent" ? "parent" : "sitter";

    setUserRoleChoice(profileRole);

    try {
      localStorage.setItem(
        "anynanny_service_track",
        path === "sitter" ? "babysitter" : "parent"
      );
    } catch {
      /* ignore */
    }

    const qs = new URLSearchParams({
      role: profileRole,
      track: "babysitter"
    });

    if (action === "register") {
      router.push(welcomeSignupHref(profileRole, `/register?${qs.toString()}`));
      return;
    }

    router.push(`/login?${qs.toString()}`);
  };

  return (
    <main className="min-h-[100dvh] w-full overflow-y-auto bg-[#FDFBF6] px-4 py-3 sm:py-5" dir="rtl">
      <div className="mx-auto flex min-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col items-center justify-start gap-3 pt-1 sm:min-h-[calc(100dvh-2.5rem)] sm:justify-center sm:gap-4 sm:pt-0">
        <PageBackRow className="w-full shrink-0">
          <Link
            href="/"
            dir="ltr"
            className={PAGE_BACK_NAV_CLASS}
            aria-label="חזרה לאתר AnyNanny"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
            <span dir="rtl">חזרה לאתר AnyNanny</span>
          </Link>
        </PageBackRow>

        <AppDownloadSection />

        <div className="shrink-0 text-center">
          <h1 className="flex w-full min-w-0 justify-center">
            <AnyNannyLogo variant="hero" />
          </h1>

          <p className="-mt-2 text-xs font-bold leading-tight text-slate-500 sm:-mt-3 sm:text-sm">
            פשוט למצוא זמן לחיים
          </p>
        </div>

        <div className="flex shrink-0 justify-center pb-4 sm:pb-5">
          <AnynannyMascotPortrait
            framed={false}
            className="h-[clamp(88px,14dvh,128px)] w-[clamp(88px,14dvh,128px)] sm:h-[148px] sm:w-[148px]"
          />
        </div>

        <HomepageWelcomeVideo
          onJoinClick={() => {
            setRegistrationOpen(true);
            window.requestAnimationFrame(() => {
              document
                .getElementById("landing-registration-options")
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
            });
          }}
        />

        <section className="w-full shrink-0 rounded-2xl border border-slate-200/80 bg-white/95 p-3 shadow-soft sm:p-4">
          <h2 className="text-center text-xl font-extrabold tracking-tight text-navy-header sm:text-2xl">
            כניסה
          </h2>

          <div className="mt-2 grid grid-cols-2 gap-2">
            {PATHS.map((path) => (
              <button
                key={`login-${path.id}`}
                type="button"
                onClick={() => navigateWithPath("login", path.id)}
                className={`flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-center transition hover:brightness-[0.99] active:scale-[0.98] sm:min-h-[92px] sm:rounded-2xl ${path.accent}`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 sm:h-10 sm:w-10 ${path.iconWrap}`}
                >
                  <PathIcon path={path.id} />
                </span>

                <span className="block text-sm font-bold leading-tight sm:text-[17px]">
                  כניסת {path.title}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="w-full shrink-0 px-1 pt-1 sm:px-1.5 sm:pt-1.5">
          <button
            type="button"
            onClick={() => setRegistrationOpen((open) => !open)}
            aria-expanded={registrationOpen}
            aria-controls="landing-registration-options"
            className="mx-auto flex w-full items-center justify-center gap-1 text-navy-header transition hover:opacity-80"
          >
            <span className="text-sm font-extrabold">הרשמה</span>
            {registrationOpen ? (
              <ChevronUp className="h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
            )}
          </button>

          <p className="mt-0.5 text-center text-[12px] leading-snug text-slate-500 sm:text-[13px]">
            עדיין אין לכם חשבון? צרו את החשבון המתאים לכם
          </p>

          <div
            id="landing-registration-options"
            className={`grid transition-[grid-template-rows,opacity,margin] duration-200 ease-out ${
              registrationOpen
                ? "mt-2 grid-rows-[1fr] opacity-100"
                : "mt-0 grid-rows-[0fr] opacity-0"
            }`}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="grid grid-cols-2 gap-2">
                {PATHS.map((path) => (
                  <button
                    key={`register-${path.id}`}
                    type="button"
                    onClick={() => navigateWithPath("register", path.id)}
                    className={`flex min-h-[70px] flex-col items-center justify-center gap-1 rounded-xl border bg-white px-2 py-2.5 text-center shadow-sm transition hover:bg-slate-50 active:scale-[0.98] sm:min-h-[78px] sm:rounded-2xl ${path.accent}`}
                  >
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-lg ring-1 sm:h-9 sm:w-9 ${path.iconWrap}`}
                    >
                      <PathIcon path={path.id} />
                    </span>

                    <span className="min-w-0">
                      <span className="block text-xs font-bold leading-tight sm:text-sm">
                        {path.title}
                      </span>

                      <span className="block text-[12px] font-medium leading-snug opacity-75 sm:text-xs">
                        הרשמה
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <p className="max-w-sm shrink-0 text-center text-[12px] leading-snug text-slate-500 sm:text-xs">
          הורים ובייביסיטריות — כל הקהילה במקום אחד.
        </p>
      </div>
    </main>
  );
}

export function AppLoginLanding() {
  return (
    <Suspense
      fallback={
        <main
          className="flex min-h-[100dvh] items-center justify-center bg-[#FDFBF6]"
          dir="rtl"
        >
          <p className="text-sm text-slate-500">טוען...</p>
        </main>
      }
    >
      <AppLoginLandingInner />
    </Suspense>
  );
}

function PlatformMark({ platform }: { platform: StorePlatformId }) {
  if (platform === "iphone") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
        <path d="M16.365 12.84c.03 3.23 2.83 4.31 2.86 4.32-.02.08-.445 1.52-1.47 3.01-.88 1.28-1.8 2.56-3.24 2.59-1.42.03-1.88-.84-3.5-.84-1.63 0-2.13.82-3.48.87-1.39.05-2.45-1.39-3.34-2.67C2.3 17.4.91 12.57 2.79 9.31c.93-1.62 2.59-2.65 4.39-2.68 1.37-.03 2.66.92 3.5.92.84 0 2.41-1.14 4.06-.97.69.03 2.63.28 3.88 2.11-.1.06-2.32 1.35-2.29 4.15zm-2.15-6.32c.74-.9 1.24-2.14 1.1-3.38-1.07.04-2.36.71-3.12 1.61-.68.79-1.28 2.05-1.12 3.26 1.18.09 2.39-.6 3.14-1.49z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
      <path d="M17.6 9.48 19.44 6.3c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24c-2.86-1.21-6.08-1.21-8.94 0L5.65 5.67c-.19-.29-.54-.37-.85-.22-.3.16-.42.54-.26.85l1.84 3.18C3.86 11.17 2.5 13.58 2.5 16.2v.3c0 .83.67 1.5 1.5 1.5h16c.83 0 1.5-.67 1.5-1.5v-.3c0-2.62-1.36-5.03-3.9-6.72ZM7 14.5c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1Zm10 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1Z" />
    </svg>
  );
}

function AppDownloadSection() {
  return (
    <section
      className="w-full shrink-0 rounded-xl bg-[#000000] px-3 py-2.5 text-[#FFFFFF] sm:px-4 sm:py-3"
      aria-labelledby="app-download-heading"
      data-app-download-banner
    >
      <h2
        id="app-download-heading"
        className="text-center text-sm font-extrabold leading-snug sm:text-base"
      >
        {APP_DOWNLOAD_HEADING}
      </h2>
      <div className="mt-2 flex flex-wrap items-stretch justify-center gap-2">
        {STORE_DOWNLOADS.map((platform) => {
          const href = verifiedStoreHref(platform.href);
          const content = (
            <>
              <PlatformMark platform={platform.id} />
              <span
                className="text-sm leading-none text-[#FFFFFF]"
                style={{ fontWeight: 800 }}
              >
                {platform.label}
              </span>
              {href ? null : (
                <span className="text-[11px] font-bold leading-none text-white/80">
                  {STORE_DOWNLOAD_SOON_LABEL}
                </span>
              )}
            </>
          );
          const itemClass =
            "inline-flex min-h-[2.5rem] flex-1 items-center justify-center gap-2 rounded-lg border border-white/35 px-3 py-2 text-[#FFFFFF] sm:min-h-[2.75rem]";

          if (href) {
            return (
              <a
                key={platform.id}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={`${itemClass} transition hover:bg-white/10`}
              >
                {content}
              </a>
            );
          }

          return (
            <span key={platform.id} className={`${itemClass} cursor-default opacity-90`}>
              {content}
            </span>
          );
        })}
      </div>
    </section>
  );
}
