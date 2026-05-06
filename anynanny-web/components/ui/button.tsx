import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

export function Button({ children, className = "", ...props }: Props) {
  return (
    <button
      className={`rounded-xl bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-900 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
