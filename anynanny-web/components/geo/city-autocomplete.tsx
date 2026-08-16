"use client";

import { MapPin, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ISRAEL_CITIES, type IsraelCity } from "@/lib/geo/israel-cities";

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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string>(value);

  useEffect(() => {
    if (!open) setQuery(value);
  }, [value, open]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && rootRef.current?.contains(target)) return;
      setOpen(false);
      setQuery(value);
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
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
      <MapPin className="pointer-events-none absolute right-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
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

      {open ? (
        <ul
          id="parent-search-city-list"
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-52 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {suggestions.length === 0 ? (
            <li className="px-3 py-3 text-right text-xs font-medium text-slate-400">
              לא נמצאה עיר ברשימה
            </li>
          ) : (
            suggestions.map((city) => {
              const selected = city === value;
              return (
                <li key={city} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    className={`flex min-h-11 w-full items-center px-3 py-2 text-right text-sm transition ${
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
        </ul>
      ) : null}
    </div>
  );
}
