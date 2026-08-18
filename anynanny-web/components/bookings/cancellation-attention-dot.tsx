"use client";

export function CancellationAttentionDot({
  visible,
  className = ""
}: {
  visible: boolean;
  className?: string;
}) {
  if (!visible) return null;
  return (
    <span
      className={`absolute left-0 top-0 h-2.5 w-2.5 -translate-x-0.5 -translate-y-0.5 rounded-full bg-rose-600 ring-2 ring-white ${className}`.trim()}
      aria-hidden
    />
  );
}
