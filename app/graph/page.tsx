"use client";

import Link from "next/link";
import { GitBranch, ArrowRight } from "lucide-react";

export default function GraphDeprecated() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <GitBranch className="h-12 w-12 text-muted-foreground/30" />
      <h1 className="text-lg font-semibold text-foreground">Knowledge Graph</h1>
      <p className="text-sm text-muted-foreground text-center max-w-md">
        This feature is being redesigned. Contact and company relationships
        are available in the Contacts and Companies pages.
      </p>
      <Link
        href="/contacts"
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
      >
        Go to Contacts <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
