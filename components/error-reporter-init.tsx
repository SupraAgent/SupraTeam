"use client";

import { useEffect } from "react";
import { installGlobalErrorHandlers } from "@/lib/error-reporter";

/**
 * Invisible component that installs global error handlers once.
 * Place in the root layout alongside the Toaster.
 */
export function ErrorReporterInit() {
  useEffect(() => {
    installGlobalErrorHandlers();
  }, []);
  return null;
}
