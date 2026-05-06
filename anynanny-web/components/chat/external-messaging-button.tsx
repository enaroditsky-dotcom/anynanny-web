"use client";

import { useState } from "react";
import type { ChatPlatform } from "@/lib/chat/types";

type Props = {
  bookingId: string;
  bookingDate: string;
  parentName: string;
  sitterName: string;
  sitterPhone?: string;
  sitterTelegramUsername?: string;
  defaultPlatform?: ChatPlatform;
};

export function ExternalMessagingButton({
  bookingId,
  bookingDate,
  parentName,
  sitterName,
  sitterPhone,
  sitterTelegramUsername,
  defaultPlatform = "whatsapp"
}: Props) {
  const [platform, setPlatform] = useState<ChatPlatform>(defaultPlatform);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleClick = async () => {
    setLoading(true);
    setMessage("");

    const response = await fetch("/api/chat/initiate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookingId,
        bookingDate,
        parentName,
        sitterName,
        platform,
        sitterPhone,
        sitterTelegramUsername
      })
    });

    const data = (await response.json()) as { externalLink?: string; error?: string };

    if (!response.ok || !data.externalLink) {
      setMessage(data.error ?? "Could not open external messaging.");
      setLoading(false);
      return;
    }

    window.open(data.externalLink, "_blank", "noopener,noreferrer");
    setMessage(`Opened ${platform} chat and logged initiation.`);
    setLoading(false);
  };

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-xs text-navy-700" htmlFor={`platform-${bookingId}`}>
          Platform
        </label>
        <select
          id={`platform-${bookingId}`}
          className="rounded-lg border border-navy-200 px-2 py-1 text-xs"
          value={platform}
          onChange={(event) => setPlatform(event.target.value as ChatPlatform)}
        >
          <option value="whatsapp">WhatsApp</option>
          <option value="telegram">Telegram</option>
        </select>
      </div>

      <button
        className="rounded-xl bg-navy-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        type="button"
        onClick={handleClick}
        disabled={loading}
      >
        {loading ? "Opening..." : "External Messaging"}
      </button>

      {message ? <p className="text-xs text-navy-700">{message}</p> : null}
    </div>
  );
}
