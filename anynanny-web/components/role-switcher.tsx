"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const STORAGE_KEY = "active_role";

export function RoleSwitcher() {
  const pathname = usePathname();

  const isSitterMode =
    pathname === "/session" ||
    pathname.startsWith("/session/") ||
    pathname === "/sitter" ||
    pathname.startsWith("/sitter/");
  const isParentMode = pathname === "/parent/dashboard";

  useEffect(() => {
    if (isSitterMode) {
      localStorage.setItem(STORAGE_KEY, "sitter");
      return;
    }
    if (isParentMode) {
      localStorage.setItem(STORAGE_KEY, "parent");
    }
  }, [isParentMode, isSitterMode]);

  if (!isSitterMode && !isParentMode) return null;

  if (isSitterMode) {
    return (
      <Link
        href="/parent/dashboard"
        onClick={() => localStorage.setItem(STORAGE_KEY, "parent")}
        className="inline-flex items-center rounded-full border border-navy-header/30 px-3 py-1.5 text-xs font-semibold text-navy-header transition hover:bg-navy-header/5"
      >
        החלף למצב הורה
      </Link>
    );
  }

  return (
    <Link
      href="/sitter/dashboard"
      onClick={() => localStorage.setItem(STORAGE_KEY, "sitter")}
      className="inline-flex items-center rounded-full border border-navy-header/30 px-3 py-1.5 text-xs font-semibold text-navy-header transition hover:bg-navy-header/5"
    >
      החלף למצב בייביסיטר
    </Link>
  );
}
