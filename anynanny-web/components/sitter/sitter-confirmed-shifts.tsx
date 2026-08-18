"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Square } from "lucide-react";
import { ShiftCancellationApproveModal } from "@/components/bookings/shift-cancellation-approve-modal";
import { ShiftCancellationRequestModal } from "@/components/bookings/shift-cancellation-request-modal";
import { ScheduledShiftActions } from "@/components/bookings/scheduled-shift-actions";
import { SitterParentProfilePreview } from "@/components/sitter/sitter-parent-profile-preview";
import { isBookingDateToday } from "@/lib/bookings/booking-date-utils";
import { CANCELLATION_COPY, type CancellationShiftLike } from "@/lib/bookings/cancellation-request";
import { BOOKINGS_TABLE } from "@/lib/bookings/constants";
import {
  fetchConfirmedShiftsForSitter,
  type ConfirmedShiftView
} from "@/lib/bookings/sitter-confirmed-shifts";
import { useShiftCancellationFlow } from "@/lib/bookings/use-shift-cancellation-flow";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { removeRealtimeChannel, subscribePostgresChanges } from "@/lib/supabase/subscribe-postgres-changes";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";

function toCancellationShift(shift: ConfirmedShiftView): CancellationShiftLike {
  return {
    id: shift.id,
    status: shift.status,
    bookingDate: shift.booking_date,
    startTime: shift.start_time,
    endTime: shift.end_time,
    partnerName: shift.parent_full_name ?? "הורה",
    paymentStatus: shift.payment_status ?? null,
    cancellationRequestedBy: shift.cancellation_requested_by ?? null,
    cancellationRequestedRole: shift.cancellation_requested_role ?? null,
    cancellationRequestedAt: shift.cancellation_requested_at ?? null,
    cancellationMessage: shift.cancellation_message ?? null,
    cancellationApprovedBy: shift.cancellation_approved_by ?? null,
    cancellationApprovedAt: shift.cancellation_approved_at ?? null,
    cancelledBy: shift.cancelled_by ?? null,
    cancelledAt: shift.cancelled_at ?? null,
    cancellationAcknowledgedAt: shift.cancellation_acknowledged_at ?? null
  };
}

function ShiftCard({
  shift,
  sitterId,
  onRequestCancellation,
  onApproveCancellation
}: {
  shift: ConfirmedShiftView;
  sitterId: string;
  onRequestCancellation: () => void;
  onApproveCancellation: () => void;
}) {
  const isPast = new Date(shift.end_time).getTime() < Date.now();
  const isToday = isBookingDateToday(shift.booking_date);
  const isSitterStarted = shift.status === "sitter_started";
  const isParentStarted = shift.status === "parent_started";
  const isSitterEnded = shift.status === "sitter_ended";
  const cancellationShift = toCancellationShift(shift);

  return (
    <li
      className={`rounded-2xl border p-4 text-right shadow-sm ${
        isPast ? "border-slate-200 bg-slate-50/80 opacity-80" : "border-navy-header/12 bg-white"
      }`}
    >
      <div className="flex flex-row-reverse items-start justify-between gap-2">
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span
            className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${
              isSitterEnded
                ? "bg-rose-100 text-rose-900"
                : isSitterStarted
                  ? "bg-amber-100 text-amber-900"
                  : isParentStarted
                    ? "bg-sky-100 text-sky-900"
                    : isPast
                      ? "bg-slate-200 text-slate-700"
                      : "bg-emerald-100 text-emerald-900"
            }`}
          >
            {isSitterEnded
              ? "ממתין לאישור סיום"
              : isSitterStarted
                ? "ממתין לאישור הורה"
                : isParentStarted
                  ? "משמרת פעילה"
                  : isPast
                    ? "הסתיימה"
                    : "קרובה"}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[#001F3F]">{shift.parent_full_name ?? "הורה"}</p>
          <p className="mt-1 text-xs font-medium text-slate-600 tabular-nums">{shift.schedule_label}</p>
        </div>
        <CalendarClock className="h-5 w-5 shrink-0 text-[#001F3F]/70" aria-hidden />
      </div>

      {shift.status === "approved" ? (
        <ScheduledShiftActions
          shift={cancellationShift}
          viewerRole="sitter"
          viewerUserId={sitterId}
          profileLabel={CANCELLATION_COPY.parentProfile}
          contactHref={`/sitter/messages?parentId=${encodeURIComponent(shift.parent_id)}`}
          renderProfile={
            <SitterParentProfilePreview
              bookingId={shift.id}
              fallbackParentName={shift.parent_full_name}
              label={CANCELLATION_COPY.parentProfile}
              className="px-0 py-0 text-xs font-semibold text-navy-header underline hover:bg-transparent"
            />
          }
          onRequestCancellation={onRequestCancellation}
          onApproveCancellation={onApproveCancellation}
        />
      ) : null}

      {isToday && !isPast ? (
        <p className="mt-3 text-xs text-slate-500">
          התחלת משמרת להיום — השתמשו בכפתור העגול Double-Shake למעלה.
        </p>
      ) : null}

      <div className="mt-3">
        <button
          type="button"
          disabled
          title="אימות סיום משמרת — יופעל בקרוב"
          className="inline-flex w-full flex-row-reverse items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-600 opacity-60"
        >
          <Square className="h-4 w-4" aria-hidden />
          סיום משמרת
        </button>
      </div>
    </li>
  );
}

type SitterConfirmedShiftsProps = {
  sitterId?: string | null;
  /** Increment to force reload (e.g. after approving a pending request). */
  refreshNonce?: number;
  disabled?: boolean;
};

export function SitterConfirmedShifts({
  sitterId: sitterIdProp = null,
  refreshNonce = 0,
  disabled = false
}: SitterConfirmedShiftsProps) {
  const router = useRouter();
  const [sitterId, setSitterId] = useState<string | null>(sitterIdProp);
  const [shifts, setShifts] = useState<ConfirmedShiftView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (uid: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase לא זמין");
      setLoading(false);
      return;
    }
    const { shifts: rows, error: fetchError } = await fetchConfirmedShiftsForSitter(supabase, uid);
    setShifts(rows);
    setError(fetchError);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (disabled) {
      setLoading(false);
      return;
    }
    void (async () => {
      const auth = await resolveBrowserAuth();
      if (!auth.ok) {
        setError("יש להתחבר כדי לראות משמרות.");
        setLoading(false);
        return;
      }
      setSitterId(auth.userId);
      await load(auth.userId);
    })();
  }, [disabled, load]);

  const effectiveSitterId = sitterIdProp ?? sitterId;

  useEffect(() => {
    if (disabled || !effectiveSitterId) return;
    setLoading(true);
    void load(effectiveSitterId);
  }, [disabled, effectiveSitterId, load, refreshNonce]);

  useEffect(() => {
    if (disabled || !effectiveSitterId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = subscribePostgresChanges(supabase, `sitter-confirmed-bookings-${effectiveSitterId}`, {
      event: "*",
      table: BOOKINGS_TABLE,
      filter: `sitter_id=eq.${effectiveSitterId}`,
      handler: () => {
        void load(effectiveSitterId);
      }
    });

    return () => {
      removeRealtimeChannel(supabase, channel);
    };
  }, [disabled, effectiveSitterId, load]);

  const cancellation = useShiftCancellationFlow(() => {
    if (effectiveSitterId) void load(effectiveSitterId);
    router.refresh();
  });

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const up: ConfirmedShiftView[] = [];
    const old: ConfirmedShiftView[] = [];
    for (const s of shifts) {
      if (new Date(s.end_time).getTime() >= now) up.push(s);
      else old.push(s);
    }
    old.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
    return { upcoming: up, past: old };
  }, [shifts]);

  if (disabled) {
    return null;
  }

  if (loading) {
    return <p className="text-right text-sm text-slate-600">טוען לוח משמרות…</p>;
  }

  if (error) {
    return <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-right text-sm text-rose-900">{error}</p>;
  }

  return (
    <section className="mx-1 space-y-4">
      <p className="rounded-2xl border border-navy-header/10 bg-white px-4 py-3 text-right text-xs text-slate-600 shadow-sm">
        מוצגות משמרות <span className="font-semibold text-[#001F3F]">מאושרות</span> ומשמרות שהתחלתם — מטבלת
        הבקשות.
      </p>

      {upcoming.length === 0 && past.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-navy-header/15 bg-white px-4 py-10 text-center shadow-sm">
          <CalendarClock className="mx-auto h-8 w-8 text-navy-header/50" />
          <p className="mt-3 text-sm font-semibold text-[#001F3F]">אין משמרות מאושרות עדיין</p>
          <p className="mt-1 text-xs text-slate-500">לאחר אישור בקשה ממתינה למעלה, המשמרת תופיע כאן.</p>
        </div>
      ) : null}

      {upcoming.length > 0 && effectiveSitterId ? (
        <div>
          <h2 className="mb-2 text-right text-sm font-bold text-[#001F3F]">משמרות קרובות</h2>
          <ul className="space-y-3">
            {upcoming.map((shift) => (
              <ShiftCard
                key={shift.id}
                shift={shift}
                sitterId={effectiveSitterId}
                onRequestCancellation={() => cancellation.openRequest(toCancellationShift(shift))}
                onApproveCancellation={() => cancellation.openApprove(toCancellationShift(shift))}
              />
            ))}
          </ul>
        </div>
      ) : null}

      {past.length > 0 && effectiveSitterId ? (
        <div>
          <h2 className="mb-2 text-right text-sm font-bold text-slate-700">היסטוריה אחרונה</h2>
          <ul className="space-y-3">
            {past.slice(0, 10).map((shift) => (
              <ShiftCard
                key={shift.id}
                shift={shift}
                sitterId={effectiveSitterId}
                onRequestCancellation={() => cancellation.openRequest(toCancellationShift(shift))}
                onApproveCancellation={() => cancellation.openApprove(toCancellationShift(shift))}
              />
            ))}
          </ul>
        </div>
      ) : null}

      <ShiftCancellationRequestModal
        open={Boolean(cancellation.requestShift)}
        shift={cancellation.requestShift}
        partnerName={cancellation.requestShift?.partnerName ?? "הורה"}
        busy={cancellation.busy}
        error={cancellation.error}
        onClose={cancellation.close}
        onSubmit={(message) => void cancellation.submitRequest(message)}
      />
      <ShiftCancellationApproveModal
        open={Boolean(cancellation.approveShift)}
        shift={cancellation.approveShift}
        partnerName={cancellation.approveShift?.partnerName ?? "הורה"}
        busy={cancellation.busy}
        error={cancellation.error}
        onClose={cancellation.close}
        onConfirm={() => void cancellation.submitApproval()}
      />
    </section>
  );
}
