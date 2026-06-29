"use client";

import { Check, ChevronDown, MapPin } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  applyLocationPreference,
  getLocationPreferenceShortLabel,
  LOCATION_PREFERENCE_OPTIONS,
  readLocationPreference,
  type LocationPreference
} from "@/lib/location/location-preference";

type MenuPosition = {
  top: number;
  left: number;
  width: number;
};

export function LocationPreferenceRow({ hint }: { hint: string }) {
  const [preference, setPreference] = useState<LocationPreference>("while_using");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setPreference(readLocationPreference());
  }, []);

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const menuWidth = Math.max(rect.width, 248);
    const viewportPadding = 12;
    let left = rect.left;

    if (left + menuWidth > window.innerWidth - viewportPadding) {
      left = window.innerWidth - menuWidth - viewportPadding;
    }
    left = Math.max(viewportPadding, left);

    setMenuPosition({
      top: rect.bottom + 8,
      left,
      width: menuWidth
    });
  }, []);

  const closeMenu = useCallback(() => setOpen(false), []);

  const openMenu = useCallback(() => {
    updateMenuPosition();
    setOpen(true);
  }, [updateMenuPosition]);

  useEffect(() => {
    if (!open) return;

    updateMenuPosition();
    const onReposition = () => updateMenuPosition();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);

    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, closeMenu]);

  const handleSelect = useCallback(
    async (next: LocationPreference) => {
      closeMenu();
      if (busy || next === preference) return;

      setBusy(true);
      setPreference(next);
      await applyLocationPreference(next);
      setBusy(false);
    },
    [busy, closeMenu, preference]
  );

  const badgeTone =
    preference === "denied"
      ? "border-slate-200 bg-slate-50 text-slate-600"
      : "border-emerald-200 bg-emerald-50 text-emerald-800";

  const dropdown =
    open && menuPosition && typeof document !== "undefined"
      ? createPortal(
          <>
            <button
              type="button"
              aria-label="סגור תפריט מיקום"
              className="fixed inset-0 z-[115] cursor-default bg-transparent"
              onClick={closeMenu}
            />
            <div
              role="listbox"
              aria-label="העדפת מיקום"
              style={{
                position: "fixed",
                top: menuPosition.top,
                left: menuPosition.left,
                width: menuPosition.width,
                zIndex: 116
              }}
              className="origin-top animate-in fade-in zoom-in-95 overflow-hidden rounded-2xl border-2 border-[#001F3F]/15 bg-white py-1 shadow-[0_16px_48px_-12px_rgba(0,31,63,0.38)] ring-1 ring-[#001F3F]/10 duration-150"
            >
              {LOCATION_PREFERENCE_OPTIONS.map((option, index) => {
                const selected = preference === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    disabled={busy}
                    onClick={() => void handleSelect(option.value)}
                    className={`flex w-full items-center gap-2 px-3.5 py-3 text-right transition disabled:opacity-60 ${
                      index > 0 ? "border-t border-[#001F3F]/8" : ""
                    } ${selected ? "bg-[#FDFBF6]" : "hover:bg-[#FDFBF6]/70 active:bg-[#001F3F]/[0.04]"}`}
                  >
                    <span className="min-w-0 flex-1 text-xs font-semibold leading-snug text-[#001F3F]">
                      {option.label}
                    </span>
                    {selected ? (
                      <Check className="h-4 w-4 shrink-0 text-[#001F3F]" strokeWidth={2.5} aria-hidden />
                    ) : (
                      <span className="h-4 w-4 shrink-0" aria-hidden />
                    )}
                  </button>
                );
              })}
            </div>
          </>,
          document.body
        )
      : null;

  return (
    <>
      <div className="flex w-full items-center gap-3 px-4 py-3.5">
        <button
          type="button"
          onClick={openMenu}
          className="min-w-0 flex-1 text-right transition active:opacity-80"
        >
          <span className="block text-sm font-semibold text-[#001F3F]">מיקום</span>
          <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>
        </button>

        <button
          ref={triggerRef}
          type="button"
          onClick={openMenu}
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={busy}
          className={`inline-flex shrink-0 items-center gap-1 rounded-xl border-2 px-2.5 py-1.5 text-[10px] font-bold shadow-[0_2px_8px_-3px_rgba(0,31,63,0.18)] transition hover:brightness-[0.98] active:scale-[0.98] disabled:opacity-60 ${badgeTone}`}
        >
          <MapPin className="h-3 w-3 shrink-0" aria-hidden />
          <span>{getLocationPreferenceShortLabel(preference)}</span>
          <ChevronDown
            className={`h-3 w-3 shrink-0 opacity-70 transition ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
      </div>

      {dropdown}
    </>
  );
}
