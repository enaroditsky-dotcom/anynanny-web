"use client";

import { useState } from "react";
import { Check, Eye, X } from "lucide-react";

import type { TodaysLinkedBookingView } from "@/lib/bookings/todays-linked-booking";

import {
  resolveShiftTimeWindow,
  sitterHasOverlappingActiveShift,
  SITTER_OVERLAP_APPROVE_MESSAGE
} from "@/lib/bookings/sitter-shift-overlap";

import {
  formatBookingSchedule,
  updateBookingStatus,
  type PendingBookingView
} from "@/lib/bookings/sitter-pending-bookings";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { UserSafetyActions } from "@/components/safety/user-safety-actions";
import {
  ParentDetailsModal,
  type ParentDetailsPreview
} from "@/components/sitter/parent-details-modal";

type Props = {
  sitterId: string;
  booking: TodaysLinkedBookingView;

  onResponded?: (result: {
    status: "approved" | "rejected";
    booking: PendingBookingView | null;
  }) => void;

  onError?: (message: string) => void;
};

export function SitterShiftApprovalCard({
  sitterId,
  booking,
  onResponded,
  onError
}: Props) {
  const [busy, setBusy] =
    useState(false);

  const [
    actionError,
    setActionError
  ] = useState<string | null>(
    null
  );

  const [
    showParentDetails,
    setShowParentDetails
  ] = useState(false);

  const [
    parentInfo,
    setParentInfo
  ] =
    useState<ParentDetailsPreview | null>(
      null
    );

  const [
    loadingParentInfo,
    setLoadingParentInfo
  ] = useState(false);

  const [
    parentInfoError,
    setParentInfoError
  ] = useState<string | null>(
    null
  );

  const loadParentInfo =
    async () => {
      if (loadingParentInfo) {
        return;
      }

      setLoadingParentInfo(
        true
      );

      setParentInfoError(
        null
      );

      try {
        const response =
          await fetch(
            `/api/sitter/bookings/${encodeURIComponent(
              booking.id
            )}/parent-preview`,
            {
              method: "GET",
              cache: "no-store"
            }
          );

        const json =
          (await response.json()) as {
            parent?: ParentDetailsPreview;
            error?: string;
          };

        if (!response.ok) {
          setParentInfo(null);

          setParentInfoError(
            json.error ||
              "לא ניתן לטעון את פרטי ההורה."
          );

          return;
        }

        setParentInfo(
          json.parent ?? null
        );

        if (!json.parent) {
          setParentInfoError(
            "לא נמצאו פרטי הורה להצגה."
          );
        }
      } catch (err) {
        console.error(
          "[SitterShiftApprovalCard parent-preview]",
          err
        );

        setParentInfo(null);

        setParentInfoError(
          "שגיאה בטעינת פרטי ההורה."
        );
      } finally {
        setLoadingParentInfo(
          false
        );
      }
    };

  const openParentDetails =
    () => {
      setShowParentDetails(
        true
      );

      void loadParentInfo();
    };

  const closeParentDetails =
    () => {
      setShowParentDetails(
        false
      );
    };

  const handleRespond =
    async (
      status:
        | "approved"
        | "rejected"
    ) => {
      if (busy) {
        return;
      }

      const supabase =
        getSupabaseBrowserClient();

      if (!supabase) {
        const message =
          "Supabase לא זמין";

        setActionError(
          message
        );

        onError?.(message);

        return;
      }

      if (
        status ===
        "approved"
      ) {
        const proposedWindow =
          resolveShiftTimeWindow(
            booking
          );

        if (proposedWindow) {
          const hasOverlap =
            await sitterHasOverlappingActiveShift(
              supabase,
              sitterId,
              proposedWindow,
              {
                bookingId:
                  booking.id
              }
            );

          if (hasOverlap) {
            console.warn(
              "[AnyNanny Overlap Sitter Safe-Guard]:",
              SITTER_OVERLAP_APPROVE_MESSAGE
            );
          }
        }
      }

      setBusy(true);
      setActionError(null);

      const {
        row,
        error
      } =
        await updateBookingStatus(
          supabase,
          sitterId,
          booking.id,
          status
        );

      setBusy(false);

      if (error) {
        setActionError(error);

        onError?.(error);

        return;
      }

      const respondedBooking =
        row
          ? ({
              ...booking,
              ...row,
              status,
              parent_full_name:
                booking.partner_full_name
            } as PendingBookingView)
          : null;

      onResponded?.({
        status,
        booking:
          respondedBooking
      });
    };

  return (
    <>
      <div
        className="space-y-4 rounded-3xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm"
        dir="rtl"
      >
        <div className="space-y-1 text-right">
          <p className="text-sm font-bold text-amber-900">
            בקשת משמרת חדשה
          </p>

          <p className="text-sm font-bold text-[#001F3F]">
            {booking.partner_full_name ??
              "הורה"}
          </p>

          <button
            type="button"
            onClick={
              openParentDetails
            }
            className="mt-1 inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-xs font-bold text-violet-700 transition hover:bg-violet-50 hover:text-violet-900"
          >
            <Eye
              className="h-4 w-4 shrink-0"
              aria-hidden
            />

            פרטי ההורה
          </button>
        </div>

        {booking.parent_id ? (
          <UserSafetyActions
            targetUserId={booking.parent_id}
            targetName={booking.partner_full_name}
          />
        ) : null}

        <p className="text-right text-sm font-semibold text-slate-700">
          {booking.schedule_label ||
            formatBookingSchedule(
              booking
            )}
        </p>

        <p className="text-right text-xs leading-relaxed text-slate-600">
          יש לאשר או לדחות את
          הבקשה לפני שתוכלו
          להתחיל את המשמרת.
        </p>

        {actionError ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
            {actionError}
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void handleRespond(
                "approved"
              )
            }
            className="inline-flex flex-row-reverse items-center justify-center gap-2 rounded-xl bg-[#001F3F] px-4 py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            <Check
              className="h-4 w-4 shrink-0"
              aria-hidden
            />

            {busy
              ? "מעדכנים…"
              : "אשר בקשה"}
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void handleRespond(
                "rejected"
              )
            }
            className="inline-flex flex-row-reverse items-center justify-center gap-2 rounded-xl border-2 border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-800 transition hover:bg-rose-50 disabled:opacity-50"
          >
            <X
              className="h-4 w-4 shrink-0"
              aria-hidden
            />

            דחה בקשה
          </button>
        </div>
      </div>

      <ParentDetailsModal
        open={showParentDetails}
        titleId="parent-details-title"
        onClose={closeParentDetails}
        loading={loadingParentInfo}
        error={parentInfoError}
        parent={parentInfo}
        fallbackName={booking.partner_full_name}
        safetyUserId={booking.parent_id}
        closeLabel="סגור"
      />
    </>
  );
}