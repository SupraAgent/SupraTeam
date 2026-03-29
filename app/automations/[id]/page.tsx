"use client";

import { useParams, useRouter } from "next/navigation";
import * as React from "react";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * /automations2/[id] — Redirects to the main builder page with the workflow pre-loaded.
 * Validates UUID format before redirecting to prevent query injection.
 */
export default function WorkflowByIdPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  React.useEffect(() => {
    if (!UUID_RE.test(id)) {
      router.replace("/automations2");
      return;
    }
    router.replace(`/automations2?workflow=${encodeURIComponent(id)}`);
  }, [id, router]);

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-xs text-muted-foreground animate-pulse">Loading workflow...</div>
    </div>
  );
}
