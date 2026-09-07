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
  ParentTourCompletionModal,
  ParentTourDeclinedModal,
  ParentTourInviteModal
} from "@/components/product-tour/parent-tour-modals";
import { ProductTourEngine } from "@/components/product-tour/product-tour-engine";
import {
  PARENT_TOUR_DASHBOARD_PATH,
  PARENT_TOUR_NOW_PATH,
  PARENT_TOUR_SEARCH_PATH,
  PARENT_TOUR_SETTINGS_PATH
} from "@/lib/product-tour/constants";
import {
  canRestartParentTour,
  isParentTourOnboardingPath,
  shouldAutoOfferParentTour
} from "@/lib/product-tour/eligibility";
import { getParentTourStep, parentTourStepCount } from "@/lib/product-tour/parent-steps";
import {
  fetchParentProductTour,
  markParentTourCompleted,
  markParentTourDeclined,
  markParentTourOffered,
  markParentTourSkipped,
  markParentTourStarted
} from "@/lib/product-tour/persistence";
import { readParentTourSession, rememberParentTourChoice } from "@/lib/product-tour/session-guard";
import { mergeParentTourRows, type ParentTourTimestampPatch } from "@/lib/product-tour/tour-row";
import type { ParentTourPhase, UserProductTourRow } from "@/lib/product-tour/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isPostgrestMissingColumnError } from "@/lib/supabase/postgrest-schema";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";

type ParentTourContextValue = {
  restartParentTour: () => void;
  canRestart: boolean;
};

const ParentTourContext = createContext<ParentTourContextValue | null>(null);

export function useParentTour() {
  return useContext(ParentTourContext);
}

async function loadParentOnboardingCompletedAt(userId: string): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const full = await supabase
    .from(PROFILES_TABLE)
    .select("parent_onboarding_completed_at")
    .eq("id", userId)
    .maybeSingle();
  if (full.error) {
    if (!isPostgrestMissingColumnError(full.error.message, "parent_onboarding_completed_at")) {
      return null;
    }
    return null;
  }
  const value = (full.data as { parent_onboarding_completed_at?: string | null } | null)
    ?.parent_onboarding_completed_at;
  return typeof value === "string" && value.trim() ? value : null;
}

export function ParentTourProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoading, signedIn, effectiveRole, currentRole, user } = useAuth();
  const [phase, setPhase] = useState<ParentTourPhase>("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const [onboardingCompletedAt, setOnboardingCompletedAt] = useState<string | null>(null);
  const [tourRow, setTourRow] = useState<UserProductTourRow | null>(null);
  const [ready, setReady] = useState(false);

  const role = currentRole === "sitter" ? "sitter" : signedIn ? "parent" : effectiveRole;
  const userId = user?.id ?? null;

  const rememberTour = useCallback(
    (patch: ParentTourTimestampPatch) => {
      if (!userId) return;
      setTourRow((prev) => rememberParentTourChoice(userId, prev, patch));
    },
    [userId]
  );

  const persistTour = useCallback(
    (writer: (client: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>, id: string) => Promise<UserProductTourRow | null>) => {
      if (!userId) return;
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        console.warn("[parent-tour] persistence skipped: no supabase client");
        return;
      }
      void writer(supabase, userId)
        .then((row) => {
          if (!row) return;
          setTourRow((prev) => mergeParentTourRows(prev, row));
        })
        .catch((error: unknown) => {
          console.warn("[parent-tour] persistence failed", error);
        });
    },
    [userId]
  );

  const refreshTourState = useCallback(async () => {
    if (!signedIn || !userId || role !== "parent") {
      setOnboardingCompletedAt(null);
      setTourRow(null);
      setReady(true);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    const sessionRow = readParentTourSession(userId);
    const [completedAt, row] = await Promise.all([
      loadParentOnboardingCompletedAt(userId),
      supabase ? fetchParentProductTour(supabase, userId) : Promise.resolve(null)
    ]);
    setOnboardingCompletedAt(completedAt);
    setTourRow((prev) => mergeParentTourRows(prev, sessionRow, row));
    setReady(true);
  }, [role, signedIn, userId]);

  useEffect(() => {
    if (isLoading) return;
    void refreshTourState();
  }, [isLoading, refreshTourState]);

  useEffect(() => {
    if (isLoading || !signedIn || role !== "parent") return;
    if (!pathname.startsWith(PARENT_TOUR_DASHBOARD_PATH) && pathname !== PARENT_TOUR_SETTINGS_PATH) return;
    void refreshTourState();
  }, [isLoading, pathname, refreshTourState, role, signedIn]);

  const canRestart = canRestartParentTour({
    authenticated: Boolean(signedIn && userId),
    role
  });

  useEffect(() => {
    if (!ready || isLoading || phase !== "idle") return;
    if (isParentTourOnboardingPath(pathname)) return;
    const sessionTour = userId ? readParentTourSession(userId) : null;
    const shouldOffer = shouldAutoOfferParentTour({
      authenticated: Boolean(signedIn && userId),
      role,
      pathname,
      parentOnboardingCompletedAt: onboardingCompletedAt,
      tour: tourRow,
      sessionTour
    });
    if (!shouldOffer) return;
    if (!pathname.startsWith(PARENT_TOUR_DASHBOARD_PATH)) return;
    rememberTour({ offered_at: new Date().toISOString() });
    persistTour(markParentTourOffered);
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
    persistTour(markParentTourStarted);
    setPhase("touring");
  }, [persistTour, rememberTour]);

  const restartParentTour = useCallback(() => {
    setStepIndex(0);
    rememberTour({
      offered_at: new Date().toISOString(),
      started_at: new Date().toISOString()
    });
    persistTour(markParentTourStarted);
    setPhase("touring");
    if (pathname !== PARENT_TOUR_DASHBOARD_PATH) {
      router.push(PARENT_TOUR_DASHBOARD_PATH);
    }
  }, [pathname, persistTour, rememberTour, router]);

  const declineTour = useCallback(() => {
    rememberTour({
      offered_at: new Date().toISOString(),
      declined_at: new Date().toISOString()
    });
    persistTour(markParentTourDeclined);
    setPhase("declined-ack");
  }, [persistTour, rememberTour]);

  const skipTour = useCallback(() => {
    rememberTour({
      offered_at: new Date().toISOString(),
      skipped_at: new Date().toISOString()
    });
    persistTour(markParentTourSkipped);
    setPhase("idle");
    setStepIndex(0);
  }, [persistTour, rememberTour]);

  const finishTour = useCallback(() => {
    rememberTour({
      offered_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString()
    });
    persistTour(markParentTourCompleted);
    setPhase("complete");
  }, [persistTour, rememberTour]);

  const advanceStep = useCallback(() => {
    const nextIndex = stepIndex + 1;
    if (nextIndex >= parentTourStepCount()) {
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

  const ctx = useMemo<ParentTourContextValue>(
    () => ({ restartParentTour, canRestart }),
    [restartParentTour, canRestart]
  );

  const currentStep = phase === "touring" ? getParentTourStep(stepIndex) : null;

  return (
    <ParentTourContext.Provider value={ctx}>
      {children}
      {phase === "invite" ? (
        <ParentTourInviteModal onAccept={startTour} onDecline={declineTour} />
      ) : null}
      {phase === "declined-ack" ? (
        <ParentTourDeclinedModal onConfirm={() => setPhase("idle")} />
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
        <ParentTourCompletionModal
          onSearch={() => closeCompletion(PARENT_TOUR_SEARCH_PATH)}
          onNow={() => closeCompletion(PARENT_TOUR_NOW_PATH)}
        />
      ) : null}
    </ParentTourContext.Provider>
  );
}
