"use client";

import Image from "next/image";
import { Calendar, CalendarRange, ClipboardList, History, MessageCircle, Wallet, Zap, type LucideIcon } from "lucide-react";

type PreviewRole = "parent" | "sitter";

type Slot = {
  label: string;
  Icon: LucideIcon;
};

const PARENT_SIDES: Slot[] = [
  { label: "ארנק", Icon: Wallet },
  { label: "יומן", Icon: Calendar },
  { label: "הודעות", Icon: MessageCircle },
  { label: "היסטוריה", Icon: History }
];

const SITTER_SIDES: Slot[] = [
  { label: "ארנק", Icon: Wallet },
  { label: "יומן עבודה", Icon: CalendarRange },
  { label: "הודעות", Icon: MessageCircle },
  { label: "משמרות", Icon: ClipboardList }
];

const SURFACE =
  "fixed bottom-0 left-0 right-0 z-50 w-full border-t border-slate-200/80 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-6px_24px_-12px_rgba(15,23,42,0.12)] backdrop-blur-sm";

function stop(event: { preventDefault: () => void; stopPropagation: () => void }) {
  event.preventDefault();
  event.stopPropagation();
}

function PreviewSlot({ item }: { item: Slot }) {
  const Icon = item.Icon;
  return (
    <button
      type="button"
      data-preview-nav={item.label}
      className="flex min-w-0 w-full flex-col items-center justify-center gap-1.5 rounded-xl px-1 py-1.5 text-[13px] font-semibold leading-tight text-navy-header/70"
      onClick={stop}
    >
      <Icon className="h-[26px] w-[26px] shrink-0 stroke-[1.85]" aria-hidden />
      <span className="max-w-[5.25rem] truncate text-center">{item.label}</span>
    </button>
  );
}

function PreviewNow() {
  return (
    <button
      type="button"
      data-preview-nav="now"
      aria-label="AnyNanny Now"
      className="group relative z-10 -mt-7 flex w-full flex-col items-center justify-end gap-1 outline-none"
      onClick={stop}
    >
      <span className="relative flex h-[3.85rem] w-[3.85rem] items-center justify-center rounded-full bg-gradient-to-b from-emerald-400 to-emerald-600 text-white shadow-[0_10px_24px_-4px_rgba(16,185,129,0.55),0_4px_10px_-2px_rgba(5,150,105,0.45)] ring-[3px] ring-white">
        <span className="pointer-events-none absolute inset-[3px] rounded-full bg-gradient-to-b from-white/25 to-transparent" aria-hidden />
        <span className="relative flex flex-col items-center justify-center leading-none">
          <Zap className="mb-0.5 h-3.5 w-3.5 fill-white text-white drop-shadow-sm" aria-hidden />
          <span className="text-[13px] font-black tracking-wide" dir="ltr">
            AN
          </span>
        </span>
      </span>
      <span className="max-w-[5.5rem] text-center text-[11px] font-bold leading-tight text-navy-header/80">
        AnyNanny Now
      </span>
    </button>
  );
}

function PreviewGifts() {
  return (
    <button
      type="button"
      data-preview-nav="gifts"
      aria-label="הפתעות"
      className="group relative z-10 -mt-7 flex w-full flex-col items-center justify-end gap-1 outline-none"
      onClick={stop}
    >
      <Image
        src="/sitter-surprises-button.png"
        alt=""
        width={1282}
        height={1227}
        sizes="72px"
        className="h-[72px] w-[72px] object-contain"
      />
      <span className="max-w-[5.5rem] text-center text-[11px] font-bold leading-tight text-navy-header/80">
        הפתעות
      </span>
    </button>
  );
}

/** Visual copy of the five-slot bar. Buttons do not navigate. */
export function PreviewBottomNav({ role }: { role: PreviewRole }) {
  const sides = role === "sitter" ? SITTER_SIDES : PARENT_SIDES;
  const [leftA, leftB, rightA, rightB] = sides;

  return (
    <nav aria-label="ניווט ראשי" data-preview-bottom-nav={role} className={SURFACE}>
      <div className="mx-auto grid w-full max-w-md grid-cols-5 items-end gap-0.5" dir="ltr">
        <PreviewSlot item={leftA} />
        <PreviewSlot item={leftB} />
        {role === "sitter" ? <PreviewGifts /> : <PreviewNow />}
        <PreviewSlot item={rightA} />
        <PreviewSlot item={rightB} />
      </div>
    </nav>
  );
}
