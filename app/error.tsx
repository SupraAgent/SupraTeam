"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/error-reporter";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, {
      severity: "fatal",
      source: "client",
      component: "GlobalErrorBoundary",
      metadata: { digest: error.digest },
    });
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4">
      <div className="h-12 w-12 rounded-2xl bg-red-500/10 flex items-center justify-center">
        <svg className="h-6 w-6 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
        <p className="mt-1 text-sm text-muted-foreground max-w-md">
          {error.message || "An unexpected error occurred."}
        </p>
        {error.digest && (
          <p className="mt-1 text-xs text-muted-foreground/50 font-mono">Error ID: {error.digest}</p>
        )}
      </div>
      <Button onClick={reset} variant="secondary" size="sm">
        Try again
      </Button>
    </div>
  );
}
