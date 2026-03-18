"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { MessageCircle, Download, Users, AlertCircle } from "lucide-react";

type TgGroup = {
  id: string;
  group_name: string;
  telegram_group_id: number;
  bot_is_admin: boolean;
  member_count: number | null;
};

type ImportResult = {
  imported: number;
  skipped: number;
  total_members: number;
  admin_count?: number;
  message: string;
};

type ImportTelegramModalProps = {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
};

export function ImportTelegramModal({ open, onClose, onImported }: ImportTelegramModalProps) {
  const [groups, setGroups] = React.useState<TgGroup[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [importing, setImporting] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);

  React.useEffect(() => {
    if (open) {
      setResult(null);
      fetch("/api/groups")
        .then((r) => r.json())
        .then((data) => setGroups(data.groups ?? []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [open]);

  async function handleImport(groupId: string) {
    setImporting(groupId);
    setResult(null);
    try {
      const res = await fetch("/api/contacts/import-telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: groupId }),
      });
      const data = await res.json();
      setResult(data);
      if (data.imported > 0) {
        onImported();
      }
    } catch {
      setResult({ imported: 0, skipped: 0, total_members: 0, message: "Import failed" });
    } finally {
      setImporting(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Import from Telegram">
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Import group admins as contacts from Telegram groups where the bot is active.
          Telegram API only allows bots to see admin members.
        </p>

        {result && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
            <p className="text-foreground">{result.message}</p>
            {result.total_members > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Group has {result.total_members} total members.
                {result.admin_count ? ` ${result.admin_count} admins found.` : ""}
              </p>
            )}
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded-xl bg-white/[0.02] animate-pulse" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground/30" />
            <p className="mt-2 text-sm text-muted-foreground">No Telegram groups found</p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              Add the bot to a Telegram group as admin to start importing.
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {groups.map((group) => (
              <div
                key={group.id}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
                    <MessageCircle className="h-4 w-4 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{group.group_name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {group.bot_is_admin && (
                        <span className="text-primary">Admin</span>
                      )}
                      {group.member_count && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {group.member_count}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleImport(group.id)}
                  disabled={importing === group.id}
                >
                  <Download className="mr-1 h-3.5 w-3.5" />
                  {importing === group.id ? "Importing..." : "Import"}
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}
