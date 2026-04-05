"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Link2, Search, X, Loader2, Check, Unlink } from "lucide-react";
import { toast } from "sonner";
import type { DealEmailThread } from "@/lib/types";

interface LinkedDeal {
  id: string;
  deal_name: string;
  board_type: string;
}

interface DealSearchResult {
  id: string;
  deal_name: string;
  board_type: string;
  contact?: { name: string } | null;
  stage?: { name: string } | null;
}

interface LinkDealButtonProps {
  threadId: string;
  connectionId: string | undefined;
  subject: string;
}

export function LinkDealButton({ threadId, connectionId, subject }: LinkDealButtonProps) {
  const [open, setOpen] = React.useState(false);
  const [linkedDeals, setLinkedDeals] = React.useState<LinkedDeal[]>([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<DealSearchResult[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [linking, setLinking] = React.useState<string | null>(null);
  const [loadingLinks, setLoadingLinks] = React.useState(false);
  const searchTimerRef = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  const panelRef = React.useRef<HTMLDivElement>(null);

  // Close on click outside
  React.useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Load linked deals when popover opens
  React.useEffect(() => {
    if (!open || !connectionId) return;
    setLoadingLinks(true);
    fetchLinkedDeals();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, connectionId]);

  async function fetchLinkedDeals() {
    if (!connectionId) return;
    try {
      // Fetch all deals then filter for ones linked to this thread
      const res = await fetch(`/api/deals?limit=500`);
      if (!res.ok) return;
      const json = await res.json();
      const allDeals: DealSearchResult[] = json.deals ?? [];

      // Fetch links for each deal that might be linked to this thread
      // Better approach: query by thread_id across all deals
      const linksRes = await fetch(`/api/email/thread-deals?thread_id=${encodeURIComponent(threadId)}&connection_id=${encodeURIComponent(connectionId)}`);
      if (linksRes.ok) {
        const linksJson = await linksRes.json();
        const links: DealEmailThread[] = linksJson.data ?? [];
        const linkedDealIds = new Set(links.map((l) => l.deal_id));
        const linked = allDeals
          .filter((d) => linkedDealIds.has(d.id))
          .map((d) => ({ id: d.id, deal_name: d.deal_name, board_type: d.board_type }));
        setLinkedDeals(linked);
      }
    } catch {
      // silent
    } finally {
      setLoadingLinks(false);
    }
  }

  // Debounced deal search
  React.useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/deals?limit=20`);
        if (!res.ok) return;
        const json = await res.json();
        const allDeals: DealSearchResult[] = json.deals ?? [];
        const query = searchQuery.toLowerCase();
        const filtered = allDeals.filter(
          (d) =>
            d.deal_name.toLowerCase().includes(query) ||
            d.contact?.name?.toLowerCase().includes(query) ||
            d.board_type.toLowerCase().includes(query)
        );
        setSearchResults(filtered.slice(0, 10));
      } catch {
        // silent
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery]);

  async function handleLink(dealId: string, dealName: string, boardType: string) {
    if (!connectionId) return;
    setLinking(dealId);
    try {
      const res = await fetch(`/api/deals/${dealId}/email-threads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: threadId,
          connection_id: connectionId,
          subject,
        }),
      });
      if (res.ok) {
        setLinkedDeals((prev) => [...prev, { id: dealId, deal_name: dealName, board_type: boardType }]);
        toast.success(`Linked to ${dealName}`);
        setSearchQuery("");
        setSearchResults([]);
      } else {
        toast.error("Failed to link thread");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setLinking(null);
    }
  }

  async function handleUnlink(dealId: string) {
    if (!connectionId) return;
    setLinking(dealId);
    try {
      const res = await fetch(
        `/api/deals/${dealId}/email-threads?thread_id=${encodeURIComponent(threadId)}&connection_id=${encodeURIComponent(connectionId)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setLinkedDeals((prev) => prev.filter((d) => d.id !== dealId));
        toast.success("Unlinked from deal");
      } else {
        toast.error("Failed to unlink");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setLinking(null);
    }
  }

  const linkedDealIds = new Set(linkedDeals.map((d) => d.id));

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        title="Link to Deal"
        className={cn(
          "flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs transition-colors",
          linkedDeals.length > 0
            ? "bg-primary/10 text-primary hover:bg-primary/20"
            : "text-muted-foreground hover:text-foreground hover:bg-white/5"
        )}
      >
        <Link2 className="h-3.5 w-3.5" />
        {linkedDeals.length > 0 ? `${linkedDeals.length} deal${linkedDeals.length > 1 ? "s" : ""}` : "Link Deal"}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-80 rounded-xl border border-white/10 bg-[hsl(225,35%,8%)] shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
            <span className="text-xs font-medium text-foreground">Link to Deal</span>
            <button
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Linked deals */}
          {loadingLinks ? (
            <div className="px-3 py-4 flex items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : linkedDeals.length > 0 ? (
            <div className="px-3 py-2 space-y-1 border-b border-white/10">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Linked</span>
              {linkedDeals.map((deal) => (
                <div
                  key={deal.id}
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 bg-primary/5"
                >
                  <a
                    href={`/pipeline?deal=${deal.id}`}
                    className="flex items-center gap-1.5 text-xs text-primary hover:underline min-w-0 truncate"
                  >
                    <Check className="h-3 w-3 shrink-0" />
                    <span className="truncate">{deal.deal_name}</span>
                    <span className="text-[9px] text-primary/50 shrink-0">{deal.board_type}</span>
                  </a>
                  <button
                    onClick={() => handleUnlink(deal.id)}
                    disabled={linking === deal.id}
                    className="ml-2 text-muted-foreground hover:text-red-400 transition-colors shrink-0"
                    title="Unlink"
                  >
                    {linking === deal.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Unlink className="h-3 w-3" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {/* Search */}
          <div className="p-3 space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search deals..."
                className="w-full h-8 rounded-lg border border-white/10 bg-white/[0.04] pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/40"
                autoFocus
              />
              {searching && (
                <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* Results */}
            {searchResults.length > 0 && (
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                {searchResults
                  .filter((d) => !linkedDealIds.has(d.id))
                  .map((deal) => (
                    <button
                      key={deal.id}
                      onClick={() => handleLink(deal.id, deal.deal_name, deal.board_type)}
                      disabled={linking === deal.id}
                      className="w-full text-left rounded-lg px-2 py-1.5 hover:bg-white/5 transition-colors flex items-center justify-between group"
                    >
                      <div className="min-w-0">
                        <p className="text-xs text-foreground truncate">{deal.deal_name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[9px] text-muted-foreground">{deal.board_type}</span>
                          {deal.stage && (
                            <span className="text-[9px] text-muted-foreground/60">{deal.stage.name}</span>
                          )}
                          {deal.contact && (
                            <span className="text-[9px] text-muted-foreground/40">{deal.contact.name}</span>
                          )}
                        </div>
                      </div>
                      {linking === deal.id ? (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />
                      ) : (
                        <Link2 className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      )}
                    </button>
                  ))}
              </div>
            )}

            {searchQuery && !searching && searchResults.filter((d) => !linkedDealIds.has(d.id)).length === 0 && (
              <p className="text-center text-[10px] text-muted-foreground py-2">No deals found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
