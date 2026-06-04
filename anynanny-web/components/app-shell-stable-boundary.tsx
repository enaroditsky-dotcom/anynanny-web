"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };

type State = { error: Error | null };

/**
 * Catches render errors in routed page content without unmounting the app shell header/nav.
 */
export class AppShellStableBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("[app-shell] content render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-right text-sm text-rose-800">
          לא ניתן להציג את המסך כרגע. נסו לרענן או לעבור ללשונית אחרת.
        </p>
      );
    }
    return this.props.children;
  }
}
