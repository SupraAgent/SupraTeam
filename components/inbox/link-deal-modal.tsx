"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Search,
  Plus,
  Link2,
  ExternalLink,
  Loader2,
  Check,
} from "lucide-react";
import { toast } from "sonner";

type LinkedChatType = "dm" | "group" | "channel" | "supergroup";

interface LinkedDeal {
  id: string;
  deal_name: string;
  board_type: string;
  stage_id: string | null;
  value: number | null;
  contact: { id: string; name: string } | null;
  stage: { id: string; name: string; color: string; position: number } | null;
}

interface PipelineStage {
  id: string;
  name: string;
  position: number;
  color: string;
}

interface LinkDealModalProps {
  chatId: number;
  chatType: LinkedChatType;
  chatTitle: string;
  chatLink?: string;
  open: boolean;
  onClose: () => void;
  onDealLinked: (dealId: string) => void;
}

export function LinkDealModal({
  chatId,
  chatType,
  chatTitle,
  chatLink,
  open,
  onClose,
  onDealLinked,
}: LinkDealModalProps) {
  const [search, setSearch] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<LinkedDeal[]>([]);
  const [alreadyLinked, setAlreadyLinked] = React.useState<LinkedDeal[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [loadingLinked, setLoadingLinked] = React.useState(false);
  const [linking, setLinking] = React.useState<string | null>(null);
  const [showCreate, setShowCreate] = React.useState(false);

  // Quick-create state
  const [createName, setCreateName] = React.useState("");
  const [createBoard, setCreateBoard] = React.useState<"BD" | "Marketing" | "Admin" | "Applications">("BD");
  const [stages, setStages] = React.useState<PipelineStage[]>([]);
  const [createStageId, setCreateStageId] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch already-linked deals when modal opens
  React.useEffect(() => {
    if (!open) return;
    setLoadingLinked(true);
    fetch(`/api/deals/by-chat?chat_id=${chatId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setAlreadyLinked(data?.data ?? []);
      })
      .catch(() => {})
      .finally(() => setLoadingLinked(false));
  }, [open, chatId]);

  // Reset state on close
  React.useEffect(() => {
    if (!open) {
      setSearch("");
      setSearchResults([]);
      setShowCreate(false);
      setCreateName("");
      setCreateBoard("BD");
      setCreateStageId("");
      setStages([]);
    } else {
      // Focus search on open
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [open]);

  // Debounced search
  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!search.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/deals?search=${encodeURIComponent(search.trim())}&limit=10`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.deals ?? []);
        }
      } catch {
        // silently ignore
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  // Fetch stages when board type changes for create form
  React.useEffect(() => {
    if (!showCreate) return;
    fetch(`/api/pipeline?board_type=${createBoard}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const s = data?.stages ?? [];
        setStages(s);
        if (s.length > 0 && !createStageId) {
          setCreateStageId(s[0].id);
        }
      })
      .catch(() => {});
  }, [showCreate, createBoard]); // eslint-disable-line react-hooks/exhaustive-deps

  const linkedDealIds = new Set(alreadyLinked.map((d) => d.id));

  async function handleLinkDeal(dealId: string) {
    if (linking) return;
    setLinking(dealId);
    try {
      const res = await fetch(`/api/deals/${dealId}/linked-chats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegram_chat_id: chatId,
          chat_type: chatType,
          chat_title: chatTitle,
          chat_link: chatLink ?? null,
          is_primary: alreadyLinked.length === 0,
        }),
      });
      if (res.ok) {
        toast.success("Conversation linked to deal");
        onDealLinked(dealId);
        onClose();
      } else if (res.status === 409) {
        toast.info("Already linked to this deal");
      } else {
        toast.error("Failed to link deal");
      }
    } catch {
      toast.error("Network error linking deal");
    } finally {
      setLinking(null);
    }
  }

  async function handleCreateAndLink() {
    if (creating || !createName.trim() || !createStageId) return;
    setCreating(true);
    try {
      // Create the deal
      const chatLinkUrl = chatLink ?? `https://t.me/c/${String(chatId).replace(/^-100/, "")}`;
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deal_name: createName.trim(),
          board_type: createBoard,
          stage_id: createStageId,
          telegram_chat_id: chatId,
          telegram_chat_name: chatTitle,
          telegram_chat_link: chatLinkUrl,
        }),
      });

      if (!res.ok) {
        toast.error("Failed to create deal");
        return;
      }

      const data = await res.json();
      const dealId = data.deal?.id;
      if (!dealId) {
        toast.error("Failed to create deal");
        return;
      }

      // Also create a linked-chat record for the new deal
      await fetch(`/api/deals/${dealId}/linked-chats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegram_chat_id: chatId,
          chat_type: chatType,
          chat_title: chatTitle,
          chat_link: chatLinkUrl,
          is_primary: true,
        }),
      });

      toast.success("Deal created and linked");
      onDealLinked(dealId);
      onClose();
    } catch {
      toast.error("Network error creating deal");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Link to Deal" className="max-w-md">
      {!showCreate ? (
        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search deals by name..."
              className="pl-9 h-9"
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
            )}
          </div>

          {/* Already linked */}
          {!loadingLinked && alreadyLinked.length > 0 && (
            <div>
              <p className="text-[11px] text-muted-foreground font-medium mb-1.5 uppercase tracking-wider">
                Already linked
              </p>
              <div className="space-y-1">
                {alreadyLinked.map((deal) => (
                  <div
                    key={deal.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/10"
                  >
                    <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                    <DealRow deal={deal} />
                    <a
                      href={`/pipeline?highlight=${deal.id}`}
                      className="shrink-0 text-muted-foreground hover:text-primary ml-auto"
                      title="View in pipeline"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search results */}
          {search.trim() && !searching && searchResults.length > 0 && (
            <div>
              <p className="text-[11px] text-muted-foreground font-medium mb-1.5 uppercase tracking-wider">
                Search results
              </p>
              <div className="space-y-1 max-h-[240px] overflow-y-auto thin-scroll">
                {searchResults
                  .filter((d) => !linkedDealIds.has(d.id))
                  .map((deal) => (
                    <button
                      key={deal.id}
                      onClick={() => handleLinkDeal(deal.id)}
                      disabled={linking === deal.id}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors",
                        "hover:bg-white/[0.04] border border-transparent hover:border-white/10",
                        linking === deal.id && "opacity-50 pointer-events-none"
                      )}
                    >
                      <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <DealRow deal={deal} />
                      {linking === deal.id && (
                        <Loader2 className="h-3.5 w-3.5 text-primary animate-spin shrink-0 ml-auto" />
                      )}
                    </button>
                  ))}
                {searchResults.filter((d) => !linkedDealIds.has(d.id)).length === 0 && (
                  <p className="text-[11px] text-muted-foreground/50 text-center py-2">
                    All results are already linked
                  </p>
                )}
              </div>
            </div>
          )}

          {/* No results */}
          {search.trim() && !searching && searchResults.length === 0 && (
            <p className="text-[11px] text-muted-foreground/50 text-center py-2">
              No deals found
            </p>
          )}

          {/* Create new deal button */}
          <button
            onClick={() => {
              setShowCreate(true);
              setCreateName(chatTitle);
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-white/10 text-sm text-muted-foreground hover:text-foreground hover:border-white/20 hover:bg-white/[0.02] transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create new deal
          </button>
        </div>
      ) : (
        /* Quick-create form */
        <div className="space-y-4">
          <button
            onClick={() => setShowCreate(false)}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            &larr; Back to search
          </button>

          {/* Deal name */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Deal name</label>
            <Input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="Deal name"
              className="h-9"
              autoFocus
            />
          </div>

          {/* Board type */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Board</label>
            <div className="flex gap-1.5">
              {(["BD", "Marketing", "Admin", "Applications"] as const).map((b) => (
                <button
                  key={b}
                  onClick={() => {
                    setCreateBoard(b);
                    setCreateStageId("");
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                    createBoard === b
                      ? "bg-primary text-primary-foreground"
                      : "bg-white/5 text-muted-foreground hover:text-foreground hover:bg-white/10"
                  )}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          {/* Stage */}
          {stages.length > 0 && (
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Stage</label>
              <select
                value={createStageId}
                onChange={(e) => setCreateStageId(e.target.value)}
                className="w-full h-9 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-foreground outline-none"
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Chat info */}
          <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-2.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
              Will be linked to
            </p>
            <p className="text-xs text-foreground truncate">{chatTitle}</p>
            <p className="text-[10px] text-muted-foreground">
              {chatType} &middot; ID: {chatId}
            </p>
          </div>

          {/* Create button */}
          <button
            onClick={handleCreateAndLink}
            disabled={creating || !createName.trim() || !createStageId}
            className={cn(
              "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:opacity-50 disabled:pointer-events-none"
            )}
          >
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Create &amp; Link Deal
              </>
            )}
          </button>
        </div>
      )}
    </Modal>
  );
}

function DealRow({ deal }: { deal: LinkedDeal }) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-sm text-foreground truncate">{deal.deal_name}</p>
      <div className="flex items-center gap-2 mt-0.5">
        {deal.stage && (
          <span className="flex items-center gap-1 text-[10px] font-medium" style={{ color: deal.stage.color }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: deal.stage.color }} />
            {deal.stage.name}
          </span>
        )}
        <Badge className="text-[9px] px-1.5 py-0">{deal.board_type}</Badge>
        {deal.contact && (
          <span className="text-[10px] text-muted-foreground truncate">{deal.contact.name}</span>
        )}
        {deal.value != null && deal.value > 0 && (
          <span className="text-[10px] text-muted-foreground">
            ${Number(deal.value).toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}
