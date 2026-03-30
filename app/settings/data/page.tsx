"use client";

import { Download } from "lucide-react";

export default function DataExportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Export</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Download your CRM data as CSV files.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <a
          href="/api/deals/export"
          className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-4 transition hover:bg-white/[0.06]"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/20">
            <Download className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Export Deals</p>
            <p className="text-xs text-muted-foreground">
              Download all deals as CSV
            </p>
          </div>
        </a>

        <a
          href="/api/contacts/export"
          className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-4 transition hover:bg-white/[0.06]"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/20">
            <Download className="h-5 w-5 text-orange-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              Export Contacts
            </p>
            <p className="text-xs text-muted-foreground">
              Download all contacts as CSV
            </p>
          </div>
        </a>
      </div>
    </div>
  );
}
