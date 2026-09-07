"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import {
  SitterTourCompletionModal,
  SitterTourDeclinedModal,
  SitterTourInviteModal
} from "@/components/product-tour/sitter-tour-modals";
import { ProductTourEngine } from "@/components/product-tour/product-tour-engine";
import {
  SITTER_TOUR_DASHBOARD_PATH,
  SITTER_TOUR_KEY,
  SITTER_TOUR_PROFILE_PATH,
  SITTER_TOUR_SCHEDULE_PATH,
  SITTER_TOUR_SETTINGS_PATH
} from "@/lib/product-tour/constants";
import {
  canRestartSitterTour,
  isSitterTourOnboardingPath,
  matchesTourRoute,
  shouldAutoOfferSitterTour
} from "@/lib/product-tour/eligibility";
import { getSitterTourStep, sitterTourStepCount } from "@/lib/product-tour/sitter-steps";
import {
  fetchSitterProductTour,
  markSitterTourCompleted,
  markSitterTourDeclined,
  markSitterTourOffered,
  markSitterTourSkipped,
  markSitterTourStarted
} from "@/lib/product-tour/persistence";
import { readSitterTourSession, rememberSitterTourChoice } from "@/lib/product-tour/session-guard";
import { mergeProductTourRows, type ProductTourTimestampPatch } from "@/lib/product-tour/tour-row";
import type { SitterTourPhase, UserProductTourRow } from "@/lib/product-tour/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { SITTER_PROFILES_TABLE, SITTER_PROFILES_USER_COLUMN } from "@/lib/sitter/sitter-profile";

type SitterTourContextValue = {
  restartSitterTour: () => void;
  canRestart: boolean;
};

const SitterTourContext = createContext<SitterTourContextValue | null>(null);

export function useSitterTour() {
  return useContext(SitterTourContext);
}

async function loadSitterOnboardingCompletedAt(userId: string): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const result = await supabase
    .from(SITTER_PROFILES_TABLE)
    .select("onboarding_completed_at")
    .eq(SITTER_PROFILES_USER_COLUMN, userId)
    .maybeSingle();
  if (result.error) return null;
  const value = (result.data as { onboarding_completed_at?: string | null } | null)
    ?.onboarding_completed_at;
  return typeof value === "string" && value.trim() ? value : null;
}

export function SitterTourProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoading, signedIn, effectiveRole, currentRole, user } = useAuth();
  const [phase, setPhase] = useState<SitterTourPhase>("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const [onboardingCompletedAt, setOnboardingCompletedAt] = useState<string | null>(null);
  const [tourRow, setTourRow] = useState<UserProductTourRow | null>(null);
  const [ready, setReady] = useState(false);

  const role = currentRole === "parent" ? "parent" : signedIn ? "sitter" : effectiveRole;
  const userId = user?.id ?? null;

  const rememberTour = useCallback(
    (patch: ProductTourTimestampPatch) => {
      if (!userId) return;
      setTourRow((prev) => rememberSitterTourChoice(userId, prev, patch));
    },
    [userId]
  );

  const persistTour = useCallback(
    (
      writer: (
        client: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
        id: string
      ) => Promise<UserProductTourRow | null>
    ) => {
      if (!userId) return;
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        console.warn("[sitter-tour] persistence skipped: no supabase client");
        return;
      }
      void writer(supabase, userId)
        .then((row) => {
          if (!row) return;
          setTourRow((prev) => mergeProductTourRows(SITTER_TOUR_KEY, prev, row));
        })
        .catch((error: unknown) => {
          console.warn("[sitter-tour] persistence failed", error);
        });
    },
    [userId]
  );

  const refreshTourState = useCallback(async () => {
    if (!signedIn || !userId || role !== "sitter") {
      setOnboardingCompletedAt(null);
      setTourRow(null);
      setReady(true);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    const sessionRow = readSitterTourSession(userId);
    const [completedAt, row] = await Promise.all([
      loadSitterOnboardingCompletedAt(userId),
      supabase ? fetchSitterProductTour(supabase, userId) : Promise.resolve(null)
    ]);
    setOnboardingCompletedAt(completedAt);
    setTourRow((prev) => mergeProductTourRows(SITTER_TOUR_KEY, prev, sessionRow, row));
    setReady(true);
  }, [role, signedIn, userId]);

  useEffect(() => {
    if (isLoading) return;
    void refreshTourState();
  }, [isLoading, refreshTourState]);

  useEffect(() => {
    if (isLoading || !signedIn || role !== "sitter") return;
    if (!pathname.startsWith(SITTER_TOUR_DASHBOARD_PATH) && pathname !== SITTER_TOUR_SETTINGS_PATH) {
      return;
    }
    void refreshTourState();
  }, [isLoading, pathname, refreshTourState, role, signedIn]);

  const canRestart = canRestartSitterTour({
    authenticated: Boolean(signedIn && userId),
    role: role
  });

  useEffect(() => {
    if (!ready || isLoading || phase !== "idle") return;
    if (isSitterTourOnboardingPath(pathname)) return;
    const sessionTour = userId ? readSitterTourSession(userId) : null;
    const shouldOffer = shouldAutoOfferSitterTour({
      authenticated: Boolean(signedIn && userId),
      role: role,
      pathname,
      sitterOnboardingCompletedAt: onboardingCompletedAt,
      tour: tourRow,
      sessionTour
    });
    if (!shouldOffer) return;
    if (!pathname.startsWith(SITTER_TOUR_DASHBOARD_PATH)) return;
    rememberTour({ offered_at: new Date().toISOString() });
    persistTour(markSitterTourOffered);
    setPhase("invite");
  }, [
    ready,
    isLoading,
    phase,
    pathname,
    signedIn,
    userId,
    role,
    onboardingCompletedAt,
    tourRow,
    rememberTour,
    persistTour
  ]);

  const startTour = useCallback(() => {
    setStepIndex(0);
    rememberTour({
      offered_at: new Date().toISOString(),
      started_at: new Date().toISOString()
    });
    persistTour(markSitterTourStarted);
    setPhase("touring");
  }, [persistTour, rememberTour]);

  const restartSitterTour = useCallback(() => {
    setStepIndex(0);
    rememberTour({
      offered_at: new Date().toISOString(),
      started_at: new Date().toISOString()
    });
    persistTour(markSitterTourStarted);
    setPhase("touring");
    if (pathname !== SITTER_TOUR_DASHBOARD_PATH) {
      router.push(SITTER_TOUR_DASHBOARD_PATH);
    }
  }, [pathname, persistTour, rememberTour, router]);

  const declineTour = useCallback(() => {
    rememberTour({
      offered_at: new Date().toISOString(),
      declined_at: new Date().toISOString()
    });
    persistTour(markSitterTourDeclined);
    setPhase("declined-ack");
  }, [persistTour, rememberTour]);

  const skipTour = useCallback(() => {
    rememberTour({
      offered_at: new Date().toISOString(),
      skipped_at: new Date().toISOString()
    });
    persistTour(markSitterTourSkipped);
    setPhase("idle");
    setStepIndex(0);
  }, [persistTour, rememberTour]);

  const finishTour = useCallback(() => {
    rememberTour({
      offered_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString()
    });
    persistTour(markSitterTourCompleted);
    setPhase("complete");
  }, [persistTour, rememberTour]);

  const advanceStep = useCallback(() => {
    const nextIndex = stepIndex + 1;
    if (nextIndex >= sitterTourStepCount()) {
      finishTour();
      return;
    }
    setStepIndex(nextIndex);
  }, [finishTour, stepIndex]);

  const closeCompletion = useCallback(
    (href: string) => {
      setPhase("idle");
      setStepIndex(0);
      router.push(href);
    },
    [router]
  );

  const currentStep = phase === "touring" ? getSitterTourStep(stepIndex) : null;

  useEffect(() => {
    if (phase !== "touring" || !currentStep) return;
    if (matchesTourRoute(pathname, currentStep.route, Boolean(currentStep.routeExact))) return;
    router.push(currentStep.route);
  }, [currentStep, pathname, phase, router]);

  const ctx = useMemo<SitterTourContextValue>(
    () => ({ restartSitterTour, canRestart }),
    [restartSitterTour, canRestart]
  );

  return (
    <SitterTourContext.Provider value={ctx}>
      {children}
      {phase === "invite" ? (
        <SitterTourInviteModal onAccept={startTour} onDecline={declineTour} />
      ) : null}
      {phase === "declined-ack" ? (
        <SitterTourDeclinedModal onConfirm={() => setPhase("idle")} />
      ) : null}
      {phase === "touring" ? (
        <ProductTourEngine
          active
          step={currentStep}
          pathname={pathname}
          onNext={advanceStep}
          onSkip={skipTour}
        />
      ) : null}
      {phase === "complete" ? (
        <SitterTourCompletionModal
          onSchedule={() => closeCompletion(SITTER_TOUR_SCHEDULE_PATH)}
          onProfile={() => closeCompletion(SITTER_TOUR_PROFILE_PATH)}
        />
      ) : null}
    </SitterTourContext.Provider>
  );
}
