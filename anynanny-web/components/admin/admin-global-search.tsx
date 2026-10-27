"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  adminSearchKeyAction,
  searchAdminDestinations,
  type AdminSearchEntry
} from "@/lib/admin/admin-search";
import { ADMIN_FOCUS_HASH_KEY, canonicalAdminHref, notifyAdminLocation } from "@/lib/admin/admin-navigation";

export function AdminGlobalSearch() {
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const results = useMemo(() => searchAdminDestinations(query), [query]);
  const active = results[activeIndex] ?? null;

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (activeIndex >= results.length) setActiveIndex(0);
  }, [activeIndex, results.length]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const choose = (entry: AdminSearchEntry) => {
    const href = canonicalAdminHref(entry.href);
    if (!href) return;
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    window.sessionStorage.setItem(ADMIN_FOCUS_HASH_KEY, "1");
    void Promise.resolve(router.push(href)).then(() => notifyAdminLocation());
  };

  return (
    <div ref={rootRef} className="relative w-full" dir="rtl" role="search">
      <label className="sr-only" htmlFor="admin-global-search">
        חיפוש באדמין
      </label>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-700"
        />
        <input
          ref={inputRef}
          id="admin-global-search"
          className={`min-h-11 w-full rounded-lg border border-navy-200 bg-white py-2 pr-3 text-right text-base text-navy-900 outline-none ring-navy-800 placeholder:text-right placeholder:text-navy-500 focus:ring-2 sm:text-sm ${
            query
              ? "pl-[4.5rem] [&::-webkit-search-cancel-button]:ml-8"
              : "pl-10"
          }`}
          type="search"
          role="combobox"
          dir="rtl"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="חפש תפריט או פעולה באדמין..."
          value={query}
          aria-expanded={open && results.length > 0}
          aria-controls={listId}
          aria-activedescendant={open && active ? `${listId}-${active.id}` : undefined}
          aria-autocomplete="list"
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (query.trim()) setOpen(true);
          }}
          onKeyDown={(event) => {
            const action = adminSearchKeyAction({
              key: event.key,
              open,
              query,
              activeIndex,
              resultCount: results.length
            });
            if (action.type === "none") return;
            event.preventDefault();
            if (action.type === "move") {
              setOpen(true);
              setActiveIndex(action.index);
              return;
            }
            if (action.type === "close") {
              setOpen(false);
              return;
            }
            if (action.type === "clear") {
              setQuery("");
              return;
            }
            const selected = results[action.index];
            if (selected) choose(selected);
          }}
        />
      </div>
      {open && results.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="תוצאות חיפוש באדמין"
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-[min(24rem,70vh)] overflow-y-auto rounded-xl border border-navy-200 bg-white py-1 text-right shadow-lg"
        >
          {results.map((result, index) => {
            const selected = index === activeIndex;
            return (
              <li key={result.id} role="presentation">
                <button
                  id={`${listId}-${result.id}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`flex min-h-11 w-full flex-col items-stretch gap-0.5 px-3 py-2 text-right ${
                    selected ? "bg-navy-800 text-white" : "text-navy-900 hover:bg-slate-100"
                  }`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(result)}
                >
                  <span className="text-sm font-semibold">{result.title}</span>
                  <span className={`text-xs ${selected ? "text-white/80" : "text-navy-600"}`}>
                    {result.section}
                  </span>
                  <span className={`text-xs leading-snug ${selected ? "text-white/80" : "text-navy-700"}`}>
                    {result.description}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {open && query.trim() && results.length === 0 ? (
        <p className="absolute inset-x-0 top-full z-50 mt-1 rounded-xl border border-navy-200 bg-white px-3 py-3 text-sm text-navy-700 shadow-lg" role="status">
          לא נמצאו תפריטים או פעולות תואמים.
        </p>
      ) : null}
    </div>
  );
}
