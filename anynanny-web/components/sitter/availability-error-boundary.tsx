"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };

type State = { error: Error | null };

export class AvailabilityErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("[sitter_availability] render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-right text-sm text-rose-800">
          לא ניתן להציג את סידור העבודה כרגע. רעננו את הדף או נסו שוב מאוחר יותר.
        </p>
      );
    }
    return this.props.children;
  }
}
