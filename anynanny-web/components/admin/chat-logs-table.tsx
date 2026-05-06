"use client";

import { useMemo, useState } from "react";
import type { ChatInitiationLog, ChatPlatform } from "@/lib/chat/types";

type Props = {
  logs: ChatInitiationLog[];
};

export function ChatLogsTable({ logs }: Props) {
  const [platform, setPlatform] = useState<"all" | ChatPlatform>("all");
  const [bookingIdQuery, setBookingIdQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const filtered = useMemo(() => {
    return logs.filter((log) => {
      if (platform !== "all" && log.platform !== platform) {
        return false;
      }

      if (bookingIdQuery.trim() && !log.bookingId.toLowerCase().includes(bookingIdQuery.trim().toLowerCase())) {
        return false;
      }

      const initiated = new Date(log.initiatedAt).getTime();
      if (fromDate) {
        const from = new Date(fromDate).getTime();
        if (!Number.isNaN(from) && initiated < from) {
          return false;
        }
      }

      if (toDate) {
        const to = new Date(toDate).getTime();
        if (!Number.isNaN(to) && initiated > to + 24 * 60 * 60 * 1000 - 1) {
          return false;
        }
      }

      return true;
    });
  }, [logs, platform, bookingIdQuery, fromDate, toDate]);

  return (
    <div>
      <div className="mb-4 grid gap-3 rounded-xl border border-navy-200 bg-white p-4 md:grid-cols-4">
        <label className="text-xs text-navy-800">
          Platform
          <select
            className="mt-1 block w-full rounded-lg border border-navy-200 p-2 text-sm"
            value={platform}
            onChange={(event) => setPlatform(event.target.value as "all" | ChatPlatform)}
          >
            <option value="all">All</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="telegram">Telegram</option>
          </select>
        </label>

        <label className="text-xs text-navy-800">
          Booking ID
          <input
            className="mt-1 block w-full rounded-lg border border-navy-200 p-2 text-sm"
            type="text"
            value={bookingIdQuery}
            onChange={(event) => setBookingIdQuery(event.target.value)}
            placeholder="booking_001"
          />
        </label>

        <label className="text-xs text-navy-800">
          From date
          <input className="mt-1 block w-full rounded-lg border border-navy-200 p-2 text-sm" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
        </label>

        <label className="text-xs text-navy-800">
          To date
          <input className="mt-1 block w-full rounded-lg border border-navy-200 p-2 text-sm" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-navy-200 bg-white p-6 text-sm text-navy-700 shadow-sm">
          No chat initiations match these filters.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((log, index) => (
            <article className="rounded-xl border border-navy-200 bg-white p-5 shadow-sm" key={`${log.bookingId}-${log.initiatedAt}-${index}`}>
              <p className="text-sm text-navy-700">
                <span className="font-medium text-navy-900">Initiated:</span> {new Date(log.initiatedAt).toLocaleString()}
              </p>
              <p className="text-sm text-navy-700">
                <span className="font-medium text-navy-900">Platform:</span> {log.platform}
              </p>
              <p className="text-sm text-navy-700">
                <span className="font-medium text-navy-900">Booking ID:</span> {log.bookingId}
              </p>
              <p className="text-sm text-navy-700">
                <span className="font-medium text-navy-900">Booking date:</span> {new Date(log.bookingDate).toLocaleString()}
              </p>
              <p className="text-sm text-navy-700">
                <span className="font-medium text-navy-900">Parent:</span> {log.parentName}
              </p>
              <p className="text-sm text-navy-700">
                <span className="font-medium text-navy-900">Sitter:</span> {log.sitterName}
              </p>
              <a className="mt-2 inline-block text-sm font-medium text-navy-800 underline" href={log.externalLink} target="_blank" rel="noreferrer">
                Open external chat link
              </a>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
