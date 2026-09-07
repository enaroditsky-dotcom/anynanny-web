"use client";

import { Map } from "lucide-react";
import { PARENT_TOUR_COPY } from "@/lib/product-tour/constants";
import { useParentTour } from "@/components/product-tour/parent-tour-provider";

export function ParentTourSettingsEntry() {
  const tour = useParentTour();
  if (!tour) return null;

  return (
    <div className="mt-6 rounded-3xl border border-slate-200/60 bg-white p-4 shadow-soft space-y-3 text-right">
      <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">הדרכה</h2>
      <button
        type="button"
        onClick={tour.restartParentTour}
        className="flex w-full items-center justify-between rounded-xl p-2.5 text-right transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#001F3F] focus-visible:ring-offset-2"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <Map className="h-4 w-4" aria-hidden />
          </div>
          <span>
            <span className="block text-sm font-bold text-slate-700">{PARENT_TOUR_COPY.settingsTitle}</span>
            <span className="mt-0.5 block text-xs text-slate-500">{PARENT_TOUR_COPY.settingsSubtitle}</span>
          </span>
        </div>
      </button>
    </div>
  );
}
