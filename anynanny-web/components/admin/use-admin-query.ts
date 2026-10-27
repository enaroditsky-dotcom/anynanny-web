"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { notifyAdminLocation } from "@/lib/admin/admin-navigation";

export function useAdminQuery() {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();

  const replaceQuery = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value == null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const qs = next.toString();
      const hash = typeof window === "undefined" ? "" : window.location.hash;
      const href = `${pathname}${qs ? `?${qs}` : ""}${hash}`;
      void Promise.resolve(router.replace(href, { scroll: false })).then(() => notifyAdminLocation());
    },
    [params, pathname, router]
  );

  return { params, pathname, replaceQuery };
}
