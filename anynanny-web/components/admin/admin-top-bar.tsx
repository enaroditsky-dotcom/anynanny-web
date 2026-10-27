"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { AdminBackButton, useAdminHeaderBackVisible } from "@/components/admin/admin-back-button";
import { AdminGlobalSearch } from "@/components/admin/admin-global-search";
import {
  ADMIN_FOCUS_HASH_KEY,
  ADMIN_LANDING_HREF,
  adminLandingFallback,
  canonicalAdminHref,
  markAdminFallback,
  notifyAdminLocation,
  parseAdminNavState,
  prepareAdminBack,
  recordAdminVisit,
  subscribeAdminLocation,
  type AdminNavState
} from "@/lib/admin/admin-navigation";

const STORAGE_KEY = "anynanny.admin.nav.v1";

function readNavState(): AdminNavState {
  if (typeof window === "undefined") return parseAdminNavState(null);
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return parseAdminNavState(raw ? JSON.parse(raw) : null);
  } catch {
    return parseAdminNavState(null);
  }
}

function writeNavState(state: AdminNavState): void {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function focusAdminHash(): void {
  const id = window.location.hash.replace(/^#/, "");
  if (!id || !/^[a-z0-9-]+$/.test(id)) return;
  let attempts = 0;
  const tryFocus = () => {
    const node = document.getElementById(id);
    if (node instanceof HTMLElement) {
      node.scrollIntoView({ block: "start" });
      node.focus({ preventScroll: true });
      return;
    }
    attempts += 1;
    if (attempts < 5) requestAnimationFrame(tryFocus);
  };
  tryFocus();
}

function AdminTopBarContent() {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const search = params.toString();
  const [locationTick, setLocationTick] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const locationRef = useRef("");
  const scrollRef = useRef(0);
  const lastHashRef = useRef<string | null>(null);
  const headerBackRef = useRef<HTMLButtonElement>(null);
  const headerBackVisible = useAdminHeaderBackVisible(headerBackRef);

  useEffect(() => subscribeAdminLocation(() => setLocationTick((value) => value + 1)), []);

  useEffect(() => {
    const onScroll = () => {
      const live = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (live !== locationRef.current) return;
      scrollRef.current = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!pathname || pathname === "/admin/login") return;
    const href = `${pathname}${search ? `?${search}` : ""}${window.location.hash}`;
    const previous = readNavState();
    const next = recordAdminVisit(previous, href, scrollRef.current);
    const arrived = Boolean(previous.pendingHref) && next.pendingHref == null;
    if (arrived) {
      if (!window.location.hash && next.pendingScroll != null) window.scrollTo(0, next.pendingScroll);
      writeNavState({ ...next, pendingScroll: null });
    } else {
      writeNavState(next);
    }
    locationRef.current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    scrollRef.current = window.scrollY;
    const hash = window.location.hash;
    const focusRequested = window.sessionStorage.getItem(ADMIN_FOCUS_HASH_KEY) === "1";
    if (focusRequested) window.sessionStorage.removeItem(ADMIN_FOCUS_HASH_KEY);
    if (hash && (lastHashRef.current === null || focusRequested || hash !== lastHashRef.current)) focusAdminHash();
    lastHashRef.current = hash;
  }, [pathname, search, locationTick]);

  const goBack = () => {
    const current = canonicalAdminHref(`${pathname}${search ? `?${search}` : ""}${window.location.hash}`);
    const state = readNavState();
    const back = prepareAdminBack(state);
    if (back.target) {
      writeNavState(back.state);
      if (back.target.includes("#")) window.sessionStorage.setItem(ADMIN_FOCUS_HASH_KEY, "1");
      void Promise.resolve(router.push(back.target)).then(() => notifyAdminLocation());
      return;
    }
    const fallback = adminLandingFallback(current);
    if (!fallback) return;
    writeNavState(markAdminFallback(state));
    void Promise.resolve(router.push(ADMIN_LANDING_HREF)).then(() => notifyAdminLocation());
  };

  const logout = async () => {
    setLoggingOut(true);
    await fetch("/api/admin/logout", { method: "POST" });
    window.sessionStorage.removeItem(STORAGE_KEY);
    window.sessionStorage.removeItem(ADMIN_FOCUS_HASH_KEY);
    router.push("/admin/login");
    router.refresh();
  };

  if (pathname === "/admin/login") return null;

  const itemClass = (href: string) =>
    `rounded-lg px-3 py-2 text-sm font-medium ${
      pathname === href ? "bg-navy-800 text-white" : "bg-slate-100 text-navy-800"
    }`;

  return (
    <>
    <header className="border-b border-navy-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 p-4">
        <div className="grid grid-cols-[auto_auto] items-center gap-2 sm:grid-cols-[auto_minmax(12rem,1fr)_auto]">
          <AdminBackButton onBack={goBack} buttonRef={headerBackRef} focusable={headerBackVisible} />
          <div className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-2">
            <AdminGlobalSearch />
          </div>
          <button
            id="admin-logout"
            className="col-start-2 row-start-1 min-h-11 justify-self-end rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 sm:col-start-3"
            type="button"
            onClick={() => void logout()}
            disabled={loggingOut}
          >
            {loggingOut ? "Logging out..." : "Logout"}
          </button>
        </div>
        <nav className="flex flex-wrap items-center gap-2" aria-label="Admin">
          <Link href="/admin/reports" className={itemClass("/admin/reports")}>
            Reports
          </Link>
          <Link href="/admin/shift-reviews" className={itemClass("/admin/shift-reviews")}>
            Shift Reviews
          </Link>
          <Link href="/admin/chat-logs" className={itemClass("/admin/chat-logs")}>
            Chat Logs
          </Link>
          <Link href="/admin/broadcast" className={itemClass("/admin/broadcast")}>
            הודעות מערכת
          </Link>
        </nav>
      </div>
    </header>
    {headerBackVisible ? null : <AdminBackButton onBack={goBack} variant="floating" />}
    </>
  );
}

export function AdminTopBar() {
  return (
    <Suspense fallback={null}>
      <AdminTopBarContent />
    </Suspense>
  );
}
