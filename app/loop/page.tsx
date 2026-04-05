"use client";

import Link from "next/link";
import { Workflow, ArrowRight } from "lucide-react";

export default function LoopDeprecated() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <Workflow className="h-12 w-12 text-muted-foreground/30" />
      <h1 className="text-lg font-semibold text-foreground">Loop Builder has moved</h1>
      <p className="text-sm text-muted-foreground text-center max-w-md">
        All workflow functionality has been consolidated into the Automations builder
        for a simpler, more powerful experience.
      </p>
      <Link
        href="/automations"
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
      >
        Go to Automations <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
