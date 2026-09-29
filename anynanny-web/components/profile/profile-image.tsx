"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { appShellScrollElement } from "@/lib/ui/app-shell";

const PROFILE_IMAGE_FRAME =
  "relative aspect-square shrink-0 items-center justify-center overflow-hidden rounded-[15%]";

type ProfileImageProps = {
  src?: string | null;
  /** Person's name, used in the zoom label. */
  name?: string | null;
  alt?: string;
  /** Size, border, background, and shadow. The rounded-square shape is applied here. */
  className?: string;
  fallback?: ReactNode;
  /**
   * Real photos open the preview. Placeholders never do.
   * Set false while an upload overlay must own the tap.
   */
  zoomable?: boolean;
};

function joinClasses(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function photoLabel(name: string): string {
  return name ? `הצגת תמונת הפרופיל של ${name}` : "הצגת תמונת הפרופיל";
}

function lockBackgroundScroll(lightbox: HTMLElement | null): () => void {
  const snapshots: Array<{
    el: HTMLElement;
    overflow: string;
    overflowY: string;
    overscroll: string;
  }> = [];

  const lock = (el: HTMLElement) => {
    snapshots.push({
      el,
      overflow: el.style.overflow,
      overflowY: el.style.overflowY,
      overscroll: el.style.overscrollBehavior
    });
    el.style.overflow = "hidden";
    el.style.overscrollBehavior = "none";
  };

  lock(document.documentElement);
  lock(document.body);

  const shell = appShellScrollElement();
  if (shell) lock(shell);

  for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
    if (lightbox && (el === lightbox || lightbox.contains(el))) continue;
    if (shell && el === shell) continue;
    const overflowY = window.getComputedStyle(el).overflowY;
    if (overflowY !== "auto" && overflowY !== "scroll") continue;
    lock(el);
  }

  return () => {
    for (const snap of snapshots) {
      snap.el.style.overflow = snap.overflow;
      snap.el.style.overflowY = snap.overflowY;
      snap.el.style.overscrollBehavior = snap.overscroll;
    }
  };
}

function ProfileImageLightbox({
  src,
  name,
  alt,
  onClose
}: {
  src: string;
  name: string;
  alt: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const closingRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  const [closing, setClosing] = useState(false);

  onCloseRef.current = onClose;

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      onCloseRef.current();
      return;
    }
    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => onCloseRef.current(), 180);
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const unlock = lockBackgroundScroll(dialog);
    const blockBackgroundGesture = (event: Event) => {
      event.preventDefault();
    };
    dialog?.addEventListener("touchmove", blockBackgroundGesture, { passive: false });
    dialog?.addEventListener("wheel", blockBackgroundGesture, { passive: false });
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        requestClose();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const items = Array.from(
        dialog.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")
      ).filter((node) => !node.hasAttribute("disabled"));
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      dialog?.removeEventListener("touchmove", blockBackgroundGesture);
      dialog?.removeEventListener("wheel", blockBackgroundGesture);
      window.removeEventListener("keydown", onKeyDown, true);
      unlock();
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [requestClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={dialogRef}
      data-profile-image-lightbox
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className={joinClasses(
        "fixed inset-0 z-[200] flex items-center justify-center overflow-hidden bg-[#001F3F]/75 p-4 backdrop-blur-[2px]",
        closing ? "opacity-0 transition-opacity duration-200 ease-out" : "profile-image-backdrop-in"
      )}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        requestClose();
      }}
    >
      <h2 id={titleId} className="sr-only">
        {name ? `תמונת הפרופיל של ${name}` : "תמונת פרופיל"}
      </h2>
      <button
        ref={closeRef}
        type="button"
        aria-label="סגירה"
        className="absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-white text-[#001F3F] shadow-sm transition hover:bg-[#FDFBF6]"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          requestClose();
        }}
      >
        <X className="h-5 w-5" aria-hidden />
      </button>
      <img
        src={src}
        alt={alt}
        className={joinClasses(
          "block h-auto w-auto min-h-0 min-w-0 rounded-[12%] object-contain shadow-[0_22px_50px_-24px_rgba(0,31,63,0.7)]",
          closing
            ? "scale-[0.96] opacity-0 transition duration-200 ease-out"
            : "profile-image-zoom-in"
        )}
        style={{ maxWidth: "min(100%, 28rem)", maxHeight: "min(72dvh, 36rem)" }}
        onClick={(event) => event.stopPropagation()}
      />
    </div>,
    document.body
  );
}

export function ProfileImage({
  src,
  name,
  alt,
  className,
  fallback = null,
  zoomable = true
}: ProfileImageProps) {
  const url = (src ?? "").trim();
  const personName = (name ?? "").trim();
  const description = alt?.trim() || (personName ? `תמונת הפרופיל של ${personName}` : "תמונת פרופיל");
  const [open, setOpen] = useState(false);
  const closePreview = useCallback(() => setOpen(false), []);
  const frameClass = joinClasses(PROFILE_IMAGE_FRAME, className);

  if (!url || !zoomable) {
    return (
      <div className={joinClasses(frameClass, "inline-flex")} aria-hidden={url ? undefined : true}>
        {url ? (
          <img src={url} alt={description} className="h-full w-full object-cover object-center" />
        ) : (
          fallback
        )}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className={joinClasses(
          frameClass,
          "inline-flex cursor-zoom-in transition duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#001F3F] focus-visible:ring-offset-2"
        )}
        aria-label={photoLabel(personName)}
        title={photoLabel(personName)}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <img src={url} alt="" className="h-full w-full object-cover object-center" />
      </button>
      {open ? (
        <ProfileImageLightbox src={url} name={personName} alt={description} onClose={closePreview} />
      ) : null}
    </>
  );
}
