"use client";

import { Eye } from "lucide-react";
import { useState } from "react";

type Props = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  disabled?: boolean;
  className?: string;
};

/** Masked password with hold-to-reveal (mouse / touch). */
export function PasswordPeekField({ id, value, onChange, autoComplete, disabled, className }: Props) {
  const [peek, setPeek] = useState(false);

  return (
    <div className={`relative min-w-0 ${className ?? ""}`}>
      <input
        id={id}
        type={peek ? "text" : "password"}
        disabled={disabled}
        autoComplete={autoComplete}
        className="block min-w-0 w-full rounded-lg border border-navy-header/20 py-2 pl-2 pr-10"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label="הצגת סיסמה זמנית"
        className={`absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 transition-colors ${
          peek ? "text-[#001F3F]" : "text-navy-header/35 hover:text-navy-header/55"
        }`}
        onMouseDown={(e) => {
          e.preventDefault();
          setPeek(true);
        }}
        onMouseUp={() => setPeek(false)}
        onMouseLeave={() => setPeek(false)}
        onTouchStart={(e) => {
          e.preventDefault();
          setPeek(true);
        }}
        onTouchEnd={() => setPeek(false)}
        onTouchCancel={() => setPeek(false)}
      >
        <Eye className="h-5 w-5" strokeWidth={2} />
      </button>
    </div>
  );
}
