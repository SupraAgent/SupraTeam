"use client";

import * as React from "react";
import { reportError } from "@/lib/error-reporter";

type Props = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export class EmailErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[EmailErrorBoundary]", error, errorInfo);
    reportError(error, {
      severity: "error",
      source: "client",
      component: errorInfo.componentStack?.split("\n")[1]?.trim() ?? "EmailErrorBoundary",
      action: "email.render",
    });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <div className="h-12 w-12 rounded-2xl bg-red-500/10 flex items-center justify-center mb-3">
            <svg className="h-6 w-6 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <p className="text-sm font-medium text-foreground mb-1">Something went wrong</p>
          <p className="text-xs text-muted-foreground mb-3">
            An unexpected error occurred in the email client. Please try again.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-foreground transition hover:bg-white/10"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
