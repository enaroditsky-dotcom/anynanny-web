"use client";

import { useState } from "react";
import { Eye } from "lucide-react";

import {
  ParentDetailsModal,
  type ParentDetailsPreview
} from "@/components/sitter/parent-details-modal";

export type SitterVisibleParentPreview = ParentDetailsPreview;

type Props = {
  bookingId: string;
  parentUserId?: string | null;
  fallbackParentName?: string | null;
  label?: string;
  className?: string;
};

export function SitterParentProfilePreview({
  bookingId,
  parentUserId = null,
  fallbackParentName,
  label = "פרטי ההורה",
  className = ""
}: Props) {
  const [open, setOpen] = useState(false);
  const [parent, setParent] = useState<SitterVisibleParentPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openPreview = async () => {
    setOpen(true);
    if (loading || parent) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/sitter/bookings/${encodeURIComponent(bookingId)}/parent-preview`,
        { method: "GET", cache: "no-store" }
      );
      const json = (await response.json().catch(() => ({}))) as {
        parent?: SitterVisibleParentPreview;
        error?: string;
      };

      if (!response.ok || !json.parent) {
        setParent(null);
        setError(json.error || "לא ניתן לטעון את פרטי ההורה.");
        return;
      }

      setParent(json.parent);
    } catch (previewError) {
      console.error("[SitterParentProfilePreview]", previewError);
      setParent(null);
      setError("שגיאה בטעינת פרטי ההורה.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void openPreview()}
        className={`inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-xs font-bold text-violet-700 transition hover:bg-violet-50 hover:text-violet-900 ${className}`}
      >
        <Eye className="h-4 w-4 shrink-0" aria-hidden />
        {label}
      </button>

      <ParentDetailsModal
        open={open}
        titleId={`parent-details-title-${bookingId}`}
        onClose={() => setOpen(false)}
        loading={loading}
        error={error}
        parent={parent}
        fallbackName={fallbackParentName}
        safetyUserId={parent?.id || parentUserId || null}
        closeLabel="חזרה למשמרות"
      />
    </>
  );
}
