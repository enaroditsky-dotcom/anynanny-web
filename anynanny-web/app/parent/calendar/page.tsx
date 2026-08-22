"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageBackLink, PageBackRow } from "@/components/navigation/page-back-link";
import { BookingCalendarPanel } from "@/components/bookings/booking-calendar-panel";
import { ShiftCancellationApproveModal } from "@/components/bookings/shift-cancellation-approve-modal";
import { ShiftCancellationRequestModal } from "@/components/bookings/shift-cancellation-request-modal";
import {
  PARENT_CALENDAR_VIEW_OPTIONS,
  type CalendarShift
} from "@/components/bookings/booking-calendar-views";
import {
  isVisibleParentCalendarShift,
  PARENT_CALENDAR_LOAD_STATUSES
} from "@/lib/bookings/calendar-shift-filters";
import {
  isCancellationColumnMissing,
  pickCancellationFields,
  withCancellationSelect
} from "@/lib/bookings/cancellation-request";
import { useCancellationAttention } from "@/lib/bookings/use-cancellation-attention";
import { CancellationAttentionModals } from "@/components/bookings/cancellation-attention-modals";
import { PendingNoResponseReminderModal } from "@/components/bookings/pending-no-response-reminder-modal";
import { useShiftCancellationFlow } from "@/lib/bookings/use-shift-cancellation-flow";
import { BOOKINGS_TABLE, type BookingStatus } from "@/lib/bookings/constants";
import { normalizeBookingStatus } from "@/lib/bookings/booking-status-normalize";
import { formatBookingSchedule } from "@/lib/bookings/sitter-pending-bookings";
import {
  fetchPublicSitterProfilesViaRpc,
  publicSitterDisplayName
} from "@/lib/sitter/fetch-parent-sitter-profile";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";
import { removeRealtimeChannel, subscribePostgresChanges } from "@/lib/supabase/subscribe-postgres-changes";

const PARENT_CALENDAR_BASE_SELECT =
  "id, parent_id, sitter_id, booking_date, start_time, end_time, status, payment_status";

export default function ParentCalendarPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [parentId, setParentId] = useState<string | null>(null);
  const [allShifts, setAllShifts] = useState<CalendarShift[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  const fetchBookedShifts = useCallback(async (resolvedParentId: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setLoadingBookings(true);
    try {
      const withCancellation = await supabase
        .from(BOOKINGS_TABLE)
        .select(withCancellationSelect(PARENT_CALENDAR_BASE_SELECT))
        .eq("parent_id", resolvedParentId)
        .in("status", [...PARENT_CALENDAR_LOAD_STATUSES, "cancelled"])
        .order("booking_date", { ascending: true })
        .order("start_time", { ascending: true });

      let rows: unknown[] | null = (withCancellation.data as unknown[] | null) ?? null;
      let error = withCancellation.error;

      if (error && isCancellationColumnMissing(error.message)) {
        const fallback = await supabase
          .from(BOOKINGS_TABLE)
          .select("id, parent_id, sitter_id, booking_date, start_time, end_time, status")
          .eq("parent_id", resolvedParentId)
          .in("status", [...PARENT_CALENDAR_LOAD_STATUSES, "cancelled"])
          .order("booking_date", { ascending: true })
          .order("start_time", { ascending: true });
        rows = (fallback.data as unknown[] | null) ?? null;
        error = fallback.error;
      }

      if (error) {
        console.warn("[parent/calendar] bookings load:", error.message);
        setAllShifts([]);
        return;
      }

      const bookings = (rows ?? []) as Record<string, unknown>[];
      if (bookings.length === 0) {
        setAllShifts([]);
        return;
      }

      const sitterIds = [...new Set(bookings.map((b) => String(b.sitter_id ?? "")))].filter(Boolean);
      const publicSitters = await fetchPublicSitterProfilesViaRpc(supabase, sitterIds);
      const nameBySitterId = new Map<string, string>();
      for (const [id, profile] of publicSitters) {
        const name = publicSitterDisplayName(profile);
        if (name) nameBySitterId.set(id, name);
      }

      const formatted = bookings
        .map((raw) => {
          const row = raw as {
            id: string;
            sitter_id: string;
            booking_date: string;
            start_time: string;
            end_time: string;
            status: BookingStatus;
            payment_status?: string | null;
          };
          const status = normalizeBookingStatus(row.status);
          if (!status) return null;
          const cancellation = pickCancellationFields(raw);
          const shift: CalendarShift = {
            id: row.id,
            partnerId: row.sitter_id,
            partnerName: nameBySitterId.get(row.sitter_id) ?? "שמרטפית AnyNanny",
            bookingDate: row.booking_date,
            startTime: row.start_time,
            endTime: row.end_time,
            status,
            scheduleLabel: formatBookingSchedule(row),
            paymentStatus:
              row.payment_status === "paid" ||
              row.payment_status === "pending_checkout" ||
              row.payment_status === "unpaid"
                ? row.payment_status
                : null,
            ...cancellation
          };
          return shift;
        })
        .filter((shift): shift is CalendarShift => shift != null)
        .filter((shift) => isVisibleParentCalendarShift(shift, Date.now(), resolvedParentId));

      setAllShifts(formatted);
    } catch (e) {
      console.warn("[parent/calendar] bookings fetch failed:", e);
      setAllShifts([]);
    } finally {
      setLoadingBookings(false);
    }
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setReady(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const user = authData.user;
        if (!user) {
          if (!cancelled) router.replace("/auth/login?next=/parent/calendar");
          return;
        }

        const { data: profile, error } = await supabase
          .from(PROFILES_TABLE)
          .select("id, role, first_name, last_name")
          .eq("id", user.id)
          .maybeSingle();

        if (error) {
          console.warn("[parent/calendar] profile load:", error.message);
        }

        if (!cancelled && profile?.role && profile.role !== "parent") {
          router.replace("/parent/dashboard");
          return;
        }

        if (!cancelled) {
          setParentId(user.id);
          setReady(true);
        }
      } catch (e) {
        console.warn("[parent/calendar] bootstrap failed:", e);
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!parentId) return;
    void fetchBookedShifts(parentId);
  }, [parentId, fetchBookedShifts]);

  useEffect(() => {
    if (!parentId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = subscribePostgresChanges(supabase, `parent-calendar-bookings-${parentId}`, {
      event: "*",
      table: BOOKINGS_TABLE,
      filter: `parent_id=eq.${parentId}`,
      handler: () => {
        void fetchBookedShifts(parentId);
      }
    });

    return () => {
      removeRealtimeChannel(supabase, channel);
    };
  }, [parentId, fetchBookedShifts]);

  const attention = useCancellationAttention(
    parentId,
    "parent",
    Boolean(parentId),
    parentId ? () => void fetchBookedShifts(parentId) : undefined
  );
  const cancellation = useShiftCancellationFlow(
    parentId
      ? () => {
          void fetchBookedShifts(parentId);
          void attention.refresh();
        }
      : undefined
  );

  const profileHref = useCallback(
    (shift: CalendarShift) => `/parent/sitter/${encodeURIComponent(shift.partnerId)}`,
    []
  );

  const contactHref = useCallback(
    (shift: CalendarShift) => `/parent/messages?sitter_id=${encodeURIComponent(shift.partnerId)}`,
    []
  );

  if (!ready) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <p className="text-center text-sm font-normal text-slate-500">טוען...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full min-w-0 max-w-md flex-col overflow-hidden pt-1" dir="rtl">
      <div className="shrink-0 space-y-4 pb-4">
        <PageBackRow>
          <PageBackLink href="/parent/dashboard" />
        </PageBackRow>

        <header className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-navy-header">
            יומן המשמרות
          </h1>
          <p className="mx-auto mt-2 max-w-[22rem] text-sm font-normal leading-relaxed text-slate-500">
            כל המשמרות שלכם במקום אחד
          </p>
        </header>
      </div>

      <BookingCalendarPanel
        shifts={allShifts}
        loading={loadingBookings}
        viewModeSelectId="parent-calendar-view-mode"
        viewOptions={PARENT_CALENDAR_VIEW_OPTIONS}
        profileHref={profileHref}
        profileLinkLabel="פרופיל שמרטפית"
        contactHref={contactHref}
        viewerRole="parent"
        viewerUserId={parentId}
        onRequestCancellation={cancellation.openRequest}
        onApproveCancellation={cancellation.openApprove}
        onAcknowledgeCancellation={(shift) => {
          void attention.acknowledgeApproved(shift.id).then((ok) => {
            if (ok && parentId) void fetchBookedShifts(parentId);
          });
        }}
        onWithdrawPending={() => {
          setWithdrawError(null);
          if (parentId) void fetchBookedShifts(parentId);
        }}
        onWithdrawPendingError={(message) => setWithdrawError(message)}
        className="min-h-0 flex-1"
      />
      {withdrawError ? (
        <p className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-right text-sm text-rose-800" role="alert">
          {withdrawError}
        </p>
      ) : null}
      <ShiftCancellationRequestModal
        open={Boolean(cancellation.requestShift)}
        shift={cancellation.requestShift}
        partnerName={cancellation.requestShift?.partnerName ?? "שמרטפית"}
        busy={cancellation.busy}
        error={cancellation.error}
        onClose={cancellation.close}
        onSubmit={(message) => void cancellation.submitRequest(message)}
      />
      <ShiftCancellationApproveModal
        open={Boolean(cancellation.approveShift)}
        shift={cancellation.approveShift}
        partnerName={cancellation.approveShift?.partnerName ?? "שמרטפית"}
        busy={cancellation.busy}
        error={cancellation.error}
        onClose={cancellation.close}
        onConfirm={() => void cancellation.submitApproval()}
      />
      <CancellationAttentionModals attention={attention} role="parent" />
      <PendingNoResponseReminderModal
        parentId={parentId}
        onWithdrawn={() => {
          if (parentId) void fetchBookedShifts(parentId);
        }}
      />
    </div>
  );
}
