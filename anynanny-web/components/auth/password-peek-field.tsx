"use client";

import { Eye, EyeOff } from "lucide-react";
import { useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import {
  passwordFieldType,
  passwordVisibilityLabel,
  togglePasswordVisible
} from "@/lib/auth/password-visibility";

type Props = {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  style?: CSSProperties;
};

type CaretSnapshot = {
  start: number;
  end: number;
  refocus: boolean;
};

/** Masked password with a persistent show/hide toggle. State is local to this field. */
export function PasswordPeekField({
  id,
  name,
  value,
  onChange,
  autoComplete,
  disabled,
  required,
  placeholder,
  className,
  inputClassName,
  style
}: Props) {
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const caretRef = useRef<CaretSnapshot | null>(null);

  useLayoutEffect(() => {
    const saved = caretRef.current;
    if (!saved) return;
    caretRef.current = null;
    const el = inputRef.current;
    if (!el) return;
    if (saved.refocus && document.activeElement !== el) {
      el.focus({ preventScroll: true });
    }
    try {
      el.setSelectionRange(saved.start, saved.end);
    } catch {
      /* Some browsers reject selection changes while the field is type=password. */
    }
  }, [visible]);

  function captureCaret(refocus: boolean) {
    const el = inputRef.current;
    if (!el) return;
    const length = el.value.length;
    caretRef.current = {
      start: el.selectionStart ?? length,
      end: el.selectionEnd ?? length,
      refocus
    };
  }

  function toggleVisibility() {
    const el = inputRef.current;
    const inputFocused = el != null && document.activeElement === el;
    if (inputFocused && el) {
      captureCaret(true);
    } else if (caretRef.current) {
      caretRef.current = { ...caretRef.current, refocus: true };
    }
    setVisible((current) => togglePasswordVisible(current));
  }

  function onMouseDown(event: MouseEvent<HTMLButtonElement>) {
    // Keep the caret in the field. Canceling mousedown does not cancel the later click.
    event.preventDefault();
  }

  function onTouchStart() {
    captureCaret(true);
  }

  function onTouchCancel() {
    caretRef.current = null;
  }

  const inputClass =
    inputClassName ??
    "block min-w-0 w-full rounded-lg border border-navy-header/20 py-2 pl-2 pr-12";

  return (
    <div className={`relative min-w-0 ${className ?? ""}`}>
      <input
        ref={inputRef}
        id={id}
        name={name}
        type={passwordFieldType(visible)}
        disabled={disabled}
        required={required}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        suppressHydrationWarning
        className={inputClass}
        style={{ ...style, paddingRight: "3rem" }}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        disabled={disabled}
        suppressHydrationWarning
        aria-label={passwordVisibilityLabel(visible)}
        aria-pressed={visible}
        className={`absolute right-0 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded touch-manipulation transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#001F3F] ${
          visible ? "text-[#001F3F]" : "text-navy-header/35 hover:text-navy-header/55"
        }`}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onTouchCancel={onTouchCancel}
        onClick={toggleVisibility}
      >
        {visible ? (
          <EyeOff className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        ) : (
          <Eye className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
