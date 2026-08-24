"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

export function AdminTopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  if (pathname === "/admin/login") {
    return null;
  }

  const handleLogout = async () => {
    setLoggingOut(true);
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  };

  return (
    <header className="border-b border-navy-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 p-4">
        <nav className="flex items-center gap-2">
          <Link
            href="/admin/reports"
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              pathname === "/admin/reports" ? "bg-navy-800 text-white" : "bg-slate-100 text-navy-800"
            }`}
          >
            Reports
          </Link>
          <Link
            href="/admin/shift-reviews"
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              pathname === "/admin/shift-reviews" ? "bg-navy-800 text-white" : "bg-slate-100 text-navy-800"
            }`}
          >
            Shift Reviews
          </Link>
          <Link
            href="/admin/chat-logs"
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              pathname === "/admin/chat-logs" ? "bg-navy-800 text-white" : "bg-slate-100 text-navy-800"
            }`}
          >
            Chat Logs
          </Link>
        </nav>

        <button
          className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
        >
          {loggingOut ? "Logging out..." : "Logout"}
        </button>
      </div>
    </header>
  );
}
