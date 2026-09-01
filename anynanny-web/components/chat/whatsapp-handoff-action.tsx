"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { isWhatsAppHandoffStatus } from "@/lib/chat/whatsapp-handoff";

type Props = {
  bookingId: string;
  bookingStatus: string | null;
  onIneligible?: () => void;
};

function openWhatsAppHandoffUrl(url: string) {
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    window.location.assign(url);
  }
}

export function WhatsAppHandoffAction({ bookingId, bookingStatus, onIneligible }: Props) {
  const eligible = isWhatsAppHandoffStatus(bookingStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [counterpartHasPhone, setCounterpartHasPhone] = useState<boolean | null>(null);
  const onIneligibleRef = useRef(onIneligible);
  onIneligibleRef.current = onIneligible;

  useEffect(() => {
    if (!eligible || !bookingId) {
      setCounterpartHasPhone(null);
      return;
    }

    let cancelled = false;
    setCounterpartHasPhone(null);
    void (async () => {
      try {
        const response = await fetch(`/api/chat/whatsapp?bookingId=${encodeURIComponent(bookingId)}`, {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store"
        });
        const data = (await response.json()) as {
          counterpartHasPhone?: boolean;
          reason?: string;
        };
        if (cancelled) return;
        if (response.status === 409 || data.reason === "not_eligible") {
          onIneligibleRef.current?.();
          return;
        }
        if (!response.ok) return;
        setCounterpartHasPhone(Boolean(data.counterpartHasPhone));
      } catch {
        if (!cancelled) return;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bookingId, eligible]);

  if (!eligible) return null;

  const missingPhone = counterpartHasPhone === false;
  const checking = counterpartHasPhone === null;

  const openHandoff = async () => {
    if (missingPhone || checking) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/chat/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ bookingId })
      });
      const data = (await response.json()) as { url?: string; error?: string; reason?: string };
      if (response.status === 409 || data.reason === "not_eligible") {
        onIneligible?.();
        setLoading(false);
        return;
      }
      if (data.reason === "no_phone" || data.reason === "bad_phone") {
        setCounterpartHasPhone(false);
        setLoading(false);
        return;
      }
      if (!response.ok || !data.url) {
        setError(data.error ?? "לא ניתן לפתוח WhatsApp כרגע.");
        setLoading(false);
        return;
      }
      openWhatsAppHandoffUrl(data.url);
    } catch {
      setError("לא ניתן לפתוח WhatsApp כרגע.");
    }
    setLoading(false);
  };

  return (
    <div className="flex items-center justify-end gap-2 border-b border-slate-100 bg-white px-3 py-2">
      <div className="min-w-0 text-right">
        <button
          type="button"
          onClick={() => void openHandoff()}
          disabled={loading || missingPhone || checking}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 underline decoration-emerald-800/30 hover:text-emerald-900 disabled:no-underline disabled:opacity-60"
        >
          <MessageCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {loading ? "פותח…" : "מעבר ל-WhatsApp"}
        </button>
        {missingPhone ? (
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500">לא הוגדר מספר טלפון</p>
        ) : (
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500">לשיחה, תמונות, וידאו והודעות קוליות</p>
        )}
        {error ? <p className="mt-0.5 text-[11px] text-rose-700">{error}</p> : null}
      </div>
    </div>
  );
}
