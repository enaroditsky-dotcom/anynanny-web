"use client";

import { Star } from "lucide-react";
import { useState } from "react";

type StarRatingInputProps = {
  value: number;
  onChange: (stars: number) => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
};

export function StarRatingInput({
  value,
  onChange,
  disabled = false,
  size = "lg"
}: StarRatingInputProps) {
  const [hover, setHover] = useState(0);
  const display = hover || value;
  const starClass =
    size === "lg"
      ? "h-10 w-10 sm:h-11 sm:w-11"
      : size === "md"
        ? "h-8 w-8 sm:h-9 sm:w-9"
        : "h-7 w-7 sm:h-8 sm:w-8";
  const hitPadding = size === "sm" ? "p-0.5" : "p-1";

  return (
    <div
      className="flex flex-row-reverse justify-center gap-0.5"
      onMouseLeave={() => setHover(0)}
      role="group"
      aria-label="דירוג כוכבים"
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const on = display >= n;
        return (
          <button
            key={n}
            type="button"
            disabled={disabled}
            className={`rounded-md ${hitPadding} transition hover:scale-110 disabled:cursor-not-allowed disabled:opacity-50`}
            aria-label={`${n} כוכבים`}
            onMouseEnter={() => !disabled && setHover(n)}
            onClick={() => onChange(n)}
          >
            <Star
              className={`${starClass} ${on ? "fill-amber-400 text-amber-500" : "fill-transparent text-slate-300"}`}
              strokeWidth={on ? 0 : 1.5}
            />
          </button>
        );
      })}
    </div>
  );
}
