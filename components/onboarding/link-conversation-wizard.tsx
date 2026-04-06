"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useTelegram } from "@/lib/client/telegram-context";
import type { TgDialog } from "@/lib/client/telegram-service";
import type { LinkedChatType } from "@/lib/types";
import {
  MessageCircle, Users, Megaphone, Search, Loader2,
  Check, ArrowRight, ArrowLeft, X, Kanban, Link2, Sparkles, AlertCircle,
} from "lucide-react";

type WizardStep = 1 | 2 | 3 | 4;

interface LinkConversationWizardProps {
  open: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

interface DealSuggestion {
  id: string;
  deal_name: string;
  stage_name?: string;
  contact_name?: string;
  match_reason: string;
}

interface PipelineStage {
  id: string;
  name: string;
  position: number;
  color: string | null;
}

interface SelectedConversation {
  telegramId: number;
  title: string;
  type: TgDialog["type"];
  username?: string;
}

interface SelectedDeal {
  id: string;
  deal_name: string;
  stage_name?: string;
  isNew?: boolean;
}

/** Map GramJS dialog type to our LinkedChatType */
function mapDialogType(type: TgDialog["type"]): LinkedChatType {
  switch (type) {
    case "private": return "dm";
    case "group": return "group";
    case "supergroup": return "supergroup";
    case "channel": return "channel";
    default: return "group";
  }
}

function chatTypeIcon(type: TgDialog["type"]) {
  switch (type) {
    case "private":
      return <MessageCircle className="h-3.5 w-3.5 text-blue-400" />;
    case "group":
      return <Users className="h-3.5 w-3.5 text-emerald-400" />;
    case "supergroup":
      return <Users className="h-3.5 w-3.5 text-purple-400" />;
    case "channel":
      return <Megaphone className="h-3.5 w-3.5 text-amber-400" />;
    default:
      return <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

export function LinkConversationWizard({ open, onClose, onComplete }: LinkConversationWizardProps) {
  const router = useRouter();
  const { status: tgStatus, service } = useTelegram();

  const [step, setStep] = React.useState<WizardStep>(1);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Step 1: Conversation selection
  const [dialogs, setDialogs] = React.useState<TgDialog[]>([]);
  const [loadingDialogs, setLoadingDialogs] = React.useState(false);
  const [conversationSearch, setConversationSearch] = React.useState("");
  const [selectedConversation, setSelectedConversation] = React.useState<SelectedConversation | null>(null);

  // Step 2: Deal selection / creation
  const [suggestions, setSuggestions] = React.useState<DealSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = React.useState(false);
  const [selectedDeal, setSelectedDeal] = React.useState<SelectedDeal | null>(null);
  const [showQuickCreate, setShowQuickCreate] = React.useState(false);
  const [newDealName, setNewDealName] = React.useState("");
  const [newDealBoard, setNewDealBoard] = React.useState<"BD" | "Marketing" | "Admin">("BD");
  const [stages, setStages] = React.useState<PipelineStage[]>([]);
  const [selectedStageId, setSelectedStageId] = React.useState<string>("");

  // Step 4: linked deal info
  const [linkedDealName, setLinkedDealName] = React.useState("");
  const [linkedConversationTitle, setLinkedConversationTitle] = React.useState("");

  const isConnected = tgStatus === "connected";

  // Reset wizard state on open/close
  React.useEffect(() => {
    if (open) {
      setStep(1);
      setError(null);
      setSelectedConversation(null);
      setSelectedDeal(null);
      setShowQuickCreate(false);
      setNewDealName("");
      setConversationSearch("");
      fetchDialogs();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchDialogs() {
    if (tgStatus !== "connected") return;
    setLoadingDialogs(true);
    try {
      const result = await service.getDialogs(50);
      setDialogs(result);
    } catch {
      // silent
    } finally {
      setLoadingDialogs(false);
    }
  }

  async function fetchSuggestions(chatId: number, chatTitle: string) {
    setLoadingSuggestions(true);
    setSuggestions([]);
    try {
      const params = new URLSearchParams({ chat_id: String(chatId), chat_title: chatTitle });
      const res = await fetch(`/api/deals/suggest-link?${params}`);
      if (res.ok) {
        const json = await res.json();
        setSuggestions(json.suggestions ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoadingSuggestions(false);
    }
  }

  async function fetchStages() {
    try {
      const res = await fetch("/api/pipeline/stages");
      if (res.ok) {
        const json = await res.json();
        const stageList: PipelineStage[] = json.stages ?? json.data ?? [];
        setStages(stageList);
        if (stageList.length > 0 && !selectedStageId) {
          setSelectedStageId(stageList[0].id);
        }
      }
    } catch {
      // silent
    }
  }

  const filteredDialogs = React.useMemo(() => {
    const top = dialogs.slice(0, 20);
    if (!conversationSearch.trim()) return top;
    const q = conversationSearch.toLowerCase();
    return top.filter(
      (d) => d.title.toLowerCase().includes(q) || d.username?.toLowerCase().includes(q)
    );
  }, [dialogs, conversationSearch]);

  function handleSelectConversation(dialog: TgDialog) {
    setSelectedConversation({
      telegramId: dialog.telegramId,
      title: dialog.title,
      type: dialog.type,
      username: dialog.username,
    });
    setStep(2);
    setError(null);
    fetchSuggestions(dialog.telegramId, dialog.title);
    fetchStages();
  }

  function handleSelectDeal(deal: DealSuggestion) {
    setSelectedDeal({
      id: deal.id,
      deal_name: deal.deal_name,
      stage_name: deal.stage_name,
    });
    setError(null);
  }

  async function handleQuickCreateDeal() {
    if (!newDealName.trim() || !selectedStageId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deal_name: newDealName.trim(),
          board_type: newDealBoard,
          stage_id: selectedStageId,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create deal");
      }
      const json = await res.json();
      const deal = json.deal ?? json.data;
      const stageName = stages.find((s) => s.id === selectedStageId)?.name;
      setSelectedDeal({
        id: deal.id,
        deal_name: deal.deal_name,
        stage_name: stageName,
        isNew: true,
      });
      setShowQuickCreate(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create deal");
    } finally {
      setLoading(false);
    }
  }

  async function handleLink() {
    if (!selectedConversation || !selectedDeal) return;
    setLoading(true);
    setError(null);
    try {
      const chatLink = selectedConversation.username
        ? `https://t.me/${selectedConversation.username}`
        : null;
      const res = await fetch(`/api/deals/${selectedDeal.id}/linked-chats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegram_chat_id: selectedConversation.telegramId,
          chat_type: mapDialogType(selectedConversation.type),
          chat_title: selectedConversation.title,
          chat_link: chatLink,
          is_primary: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to link conversation");
      }
      setLinkedDealName(selectedDeal.deal_name);
      setLinkedConversationTitle(selectedConversation.title);
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link conversation");
    } finally {
      setLoading(false);
    }
  }

  function handleGoToPipeline() {
    onComplete?.();
    onClose();
    router.push("/pipeline");
  }

  function handleDone() {
    onComplete?.();
    onClose();
  }

  const stepTitles: Record<WizardStep, string> = {
    1: "Select a Conversation",
    2: "Choose or Create a Deal",
    3: "Link Conversation to Deal",
    4: "All Set!",
  };

  return (
    <Modal open={open} onClose={onClose} title={stepTitles[step]} className="max-w-md">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-5">
        {([1, 2, 3, 4] as WizardStep[]).map((s) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div
              className={cn(
                "h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0 transition-colors",
                s < step && "bg-primary/20 text-primary",
                s === step && "bg-primary text-primary-foreground",
                s > step && "bg-white/5 text-muted-foreground/50"
              )}
            >
              {s < step ? <Check className="h-3.5 w-3.5" /> : s}
            </div>
            {s < 4 && (
              <div className={cn("h-px flex-1", s < step ? "bg-primary/30" : "bg-white/10")} />
            )}
          </div>
        ))}
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400 mb-4">
          {error}
        </div>
      )}

      {/* Step 1: Select a conversation */}
      {step === 1 && (
        <div className="space-y-3">
          {!isConnected ? (
            <div className="text-center py-6">
              <AlertCircle className="mx-auto h-8 w-8 text-amber-400/60" />
              <p className="mt-3 text-sm text-muted-foreground">Telegram not connected</p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                Go to Settings &rarr; Integrations to connect your Telegram account first.
              </p>
              <button
                onClick={onClose}
                className="mt-4 text-xs text-primary hover:underline"
              >
                Close
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
                <Input
                  value={conversationSearch}
                  onChange={(e) => setConversationSearch(e.target.value)}
                  placeholder="Search conversations..."
                  className="pl-8"
                  autoFocus
                />
              </div>

              <div className="max-h-[280px] overflow-y-auto space-y-0.5 -mx-1 px-1">
                {loadingDialogs && filteredDialogs.length === 0 && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/30" />
                  </div>
                )}

                {!loadingDialogs && filteredDialogs.length === 0 && (
                  <div className="text-center py-6">
                    <MessageCircle className="mx-auto h-6 w-6 text-muted-foreground/20" />
                    <p className="mt-2 text-xs text-muted-foreground">
                      {conversationSearch ? "No conversations match" : "No recent conversations"}
                    </p>
                  </div>
                )}

                {filteredDialogs.map((dialog) => (
                  <button
                    key={dialog.id}
                    onClick={() => handleSelectConversation(dialog)}
                    className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04] border border-transparent"
                  >
                    {chatTypeIcon(dialog.type)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-foreground truncate">
                          {dialog.title}
                        </span>
                        {dialog.username && (
                          <span className="text-[9px] text-muted-foreground/40 shrink-0">
                            @{dialog.username}
                          </span>
                        )}
                      </div>
                      {dialog.lastMessage && (
                        <p className="text-[10px] text-muted-foreground/50 truncate mt-0.5">
                          {dialog.lastMessage.senderName ? `${dialog.lastMessage.senderName}: ` : ""}
                          {dialog.lastMessage.text}
                        </p>
                      )}
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/20 shrink-0" />
                  </button>
                ))}
              </div>

              <div className="flex justify-end pt-1">
                <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Skip for now
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 2: Create or select a deal */}
      {step === 2 && (
        <div className="space-y-3">
          {/* Selected conversation summary */}
          {selectedConversation && (
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
              {chatTypeIcon(selectedConversation.type)}
              <span className="flex-1 text-xs text-foreground truncate">{selectedConversation.title}</span>
              <Badge className="text-[8px] px-1.5 py-0 bg-primary/20 text-primary border-primary/30">selected</Badge>
            </div>
          )}

          {/* Suggested deals */}
          {loadingSuggestions && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/30" />
              <span className="ml-2 text-xs text-muted-foreground">Finding matching deals...</span>
            </div>
          )}

          {!loadingSuggestions && suggestions.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Suggested deals</p>
              <div className="space-y-1">
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleSelectDeal(s)}
                    className={cn(
                      "w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors border",
                      selectedDeal?.id === s.id
                        ? "bg-primary/5 border-primary/20"
                        : "border-transparent hover:bg-white/[0.04]"
                    )}
                  >
                    <Kanban className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{s.deal_name}</p>
                      <p className="text-[10px] text-muted-foreground/60 truncate">
                        {s.stage_name && `${s.stage_name}`}
                        {s.contact_name && ` · ${s.contact_name}`}
                        {s.match_reason && ` · ${s.match_reason}`}
                      </p>
                    </div>
                    {selectedDeal?.id === s.id && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!loadingSuggestions && suggestions.length === 0 && !showQuickCreate && (
            <div className="text-center py-3">
              <p className="text-xs text-muted-foreground">No matching deals found</p>
            </div>
          )}

          {/* Quick create toggle */}
          {!showQuickCreate && !selectedDeal?.isNew && (
            <button
              onClick={() => { setShowQuickCreate(true); setSelectedDeal(null); }}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/10 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:border-white/20 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Create a new deal
            </button>
          )}

          {/* Quick create form */}
          {showQuickCreate && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-3">
              <p className="text-[11px] font-medium text-muted-foreground">New deal</p>
              <Input
                value={newDealName}
                onChange={(e) => setNewDealName(e.target.value)}
                placeholder="Deal name"
                className="text-sm"
                autoFocus
              />
              <div className="flex gap-1.5">
                {(["BD", "Marketing", "Admin"] as const).map((board) => (
                  <button
                    key={board}
                    onClick={() => setNewDealBoard(board)}
                    className={cn(
                      "flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
                      newDealBoard === board
                        ? "bg-primary/20 text-primary border border-primary/30"
                        : "bg-white/5 text-muted-foreground border border-transparent hover:bg-white/10"
                    )}
                  >
                    {board}
                  </button>
                ))}
              </div>
              {stages.length > 0 && (
                <select
                  value={selectedStageId}
                  onChange={(e) => setSelectedStageId(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-foreground"
                >
                  {stages.map((stage) => (
                    <option key={stage.id} value={stage.id}>{stage.name}</option>
                  ))}
                </select>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowQuickCreate(false)}
                  className="flex-1 rounded-lg border border-white/10 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <Button
                  size="sm"
                  onClick={handleQuickCreateDeal}
                  disabled={loading || !newDealName.trim() || !selectedStageId}
                  className="flex-1"
                >
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create Deal"}
                </Button>
              </div>
            </div>
          )}

          {/* New deal just created */}
          {selectedDeal?.isNew && (
            <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
              <Check className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-xs text-foreground truncate">
                Created: {selectedDeal.deal_name}
              </span>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => { setStep(1); setSelectedDeal(null); setShowQuickCreate(false); }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3 w-3" /> Back
            </button>
            <Button
              size="sm"
              onClick={() => { setStep(3); setError(null); }}
              disabled={!selectedDeal}
            >
              Continue <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Confirm link */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <div className="flex items-center gap-3">
              {selectedConversation && chatTypeIcon(selectedConversation.type)}
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{selectedConversation?.title}</p>
                <p className="text-[10px] text-muted-foreground">Telegram conversation</p>
              </div>
            </div>

            <div className="flex justify-center">
              <Link2 className="h-5 w-5 text-primary" />
            </div>

            <div className="flex items-center gap-3">
              <Kanban className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{selectedDeal?.deal_name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {selectedDeal?.stage_name ?? "Deal"}{selectedDeal?.isNew ? " (new)" : ""}
                </p>
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            This will link the conversation to the deal so messages appear in the deal timeline.
          </p>

          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => setStep(2)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3 w-3" /> Back
            </button>
            <Button size="sm" onClick={handleLink} disabled={loading}>
              {loading ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Linking...</>
              ) : (
                <>Link Conversation <Link2 className="h-3.5 w-3.5 ml-1" /></>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Success */}
      {step === 4 && (
        <div className="space-y-4 text-center py-2">
          <div className="mx-auto h-14 w-14 rounded-full bg-primary/20 flex items-center justify-center">
            <Check className="h-7 w-7 text-primary" />
          </div>

          <div>
            <h3 className="text-sm font-medium text-foreground">Conversation Linked</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="text-foreground font-medium">{linkedConversationTitle}</span> is now linked to{" "}
              <span className="text-foreground font-medium">{linkedDealName}</span>
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left">
            <p className="text-[11px] font-medium text-muted-foreground mb-2">What happens now:</p>
            <ul className="space-y-1.5">
              <li className="flex items-start gap-2 text-[11px] text-muted-foreground">
                <Check className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                Messages from this conversation appear in the deal timeline
              </li>
              <li className="flex items-start gap-2 text-[11px] text-muted-foreground">
                <Check className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                Deal health is tracked based on conversation activity
              </li>
              <li className="flex items-start gap-2 text-[11px] text-muted-foreground">
                <Check className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                Automations can trigger on conversation events
              </li>
            </ul>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleDone}
              className="flex-1 rounded-xl border border-white/10 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Done
            </button>
            <Button onClick={handleGoToPipeline} className="flex-1">
              Go to Pipeline <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
