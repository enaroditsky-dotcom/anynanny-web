"use client";

import { MapPin, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ISRAEL_CITIES, type IsraelCity } from "@/lib/geo/israel-cities";
import { useAnchoredOverlay } from "@/lib/ui/anchored-overlay";

function filterIsraelCities(query: string): readonly IsraelCity[] {
  const q = query.trim().toLowerCase();
  if (!q) return ISRAEL_CITIES;

  const prefix: IsraelCity[] = [];
  const partial: IsraelCity[] = [];

  for (const city of ISRAEL_CITIES) {
    const haystack = city.toLowerCase();
    if (haystack.startsWith(q)) prefix.push(city);
    else if (haystack.includes(q)) partial.push(city);
  }

  return prefix.concat(partial);
}

type CityAutocompleteProps = {
  value: IsraelCity | "";
  onChange: (city: IsraelCity | "") => void;
  disabled?: boolean;
  invalid?: boolean;
  inputClassName?: string;
};

export function CityAutocomplete({
  value,
  onChange,
  disabled = false,
  invalid = false,
  inputClassName = ""
}: CityAutocompleteProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string>(value);
  const [mounted, setMounted] = useState(false);
  const listBox = useAnchoredOverlay(open, inputRef, "trigger", "stretch", 208);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) setQuery(value);
  }, [value, open]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
      setQuery(value);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setQuery(value);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, value]);

  const suggestions = useMemo(() => filterIsraelCities(query), [query]);
  const showClear = Boolean(value || (open && query));

  const selectCity = (city: IsraelCity) => {
    onChange(city);
    setQuery(city);
    setOpen(false);
  };

  const clearCity = () => {
    onChange("");
    setQuery("");
    setOpen(true);
    inputRef.current?.focus();
  };

  return (
    <div ref={rootRef} className="relative min-w-0">
      <MapPin className="pointer-events-none absolute right-3 top-1/2 z-10 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
      <input
        ref={inputRef}
        type="text"
        inputMode="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls="parent-search-city-list"
        placeholder="בחר עיר…"
        disabled={disabled}
        aria-invalid={invalid}
        className={inputClassName}
        value={open ? query : value}
        onChange={(event) => {
          setQuery(event.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={(event) => {
          setOpen(true);
          event.currentTarget.select();
        }}
      />
      {showClear ? (
        <button
          type="button"
          aria-label="נקה עיר"
          className="absolute left-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-navy-header"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={clearCity}
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}

      {open && mounted && listBox
        ? createPortal(
        <ul
          ref={listRef}
          id="parent-search-city-list"
          role="listbox"
          dir="rtl"
          style={{
            top: listBox.placement === "below" ? listBox.top : undefined,
            bottom: listBox.placement === "above" ? listBox.bottom : undefined,
            left: listBox.left,
            width: listBox.width,
            maxHeight: listBox.maxHeight
          }}
          className="fixed z-[60] overflow-y-auto overscroll-contain rounded-xl border border-slate-300/80 bg-white py-1 shadow-[0_8px_20px_rgba(0,31,63,0.12)]"
        >
          {suggestions.length === 0 ? (
            <li className="px-3 py-3 text-right text-[14px] font-medium text-slate-400">
              לא נמצאה עיר ברשימה
            </li>
          ) : (
            suggestions.map((city) => {
              const selected = city === value;
              return (
                <li key={city} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    className={`flex min-h-11 w-full items-center px-3 py-2 text-right text-[17px] font-medium transition ${
                      selected
                        ? "bg-[#001F3F]/10 font-bold text-navy-header"
                        : "text-slate-800 hover:bg-slate-50"
                    }`}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      selectCity(city);
                    }}
                  >
                    {city}
                  </button>
                </li>
              );
            })
          )}
        </ul>,
        document.body
        )
        : null}
    </div>
  );
}
