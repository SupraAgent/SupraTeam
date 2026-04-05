"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, timeAgo } from "@/lib/utils";
import {
  Bot,
  Save,
  MessageCircle,
  AlertTriangle,
  UserCheck,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";

type AgentConfig = {
  id: string;
  name: string;
  slug: string | null;
  is_active: boolean;
  role_prompt: string;
  knowledge_base: string | null;
  qualification_fields: string[];
  auto_qualify: boolean;
  respond_to_dms: boolean;
  respond_to_groups: boolean;
  respond_to_mentions: boolean;
  max_tokens: number;
  escalation_keywords: string[];
  auto_create_deals: boolean;
  created_at: string;
  updated_at: string;
};

type Conversation = {
  id: string;
  tg_chat_id: number;
  tg_user_id: number;
  user_message: string;
  ai_response: string;
  qualification_data: Record<string, string> | null;
  escalated: boolean;
  escalation_reason: string | null;
  deal: { id: string; deal_name: string } | null;
  created_at: string;
};

export default function AIAgentSettingsPage() {
  const [config, setConfig] = React.useState<AgentConfig | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [convStats, setConvStats] = React.useState({ total: 0, escalated: 0, qualified: 0 });
  const [showConversations, setShowConversations] = React.useState(false);
  const [showEscalatedOnly, setShowEscalatedOnly] = React.useState(false);

  // Form state
  const [name, setName] = React.useState("");
  const [rolePrompt, setRolePrompt] = React.useState("");
  const [knowledgeBase, setKnowledgeBase] = React.useState("");
  const [qualFields, setQualFields] = React.useState("");
  const [autoQualify, setAutoQualify] = React.useState(false);
  const [respondDms, setRespondDms] = React.useState(false);
  const [respondGroups, setRespondGroups] = React.useState(false);
  const [respondMentions, setRespondMentions] = React.useState(true);
  const [maxTokens, setMaxTokens] = React.useState(500);
  const [escalationKw, setEscalationKw] = React.useState("");
  const [isActive, setIsActive] = React.useState(false);
  const [autoCreateDeals, setAutoCreateDeals] = React.useState(false);

  React.useEffect(() => {
    fetchConfig();
  }, []);

  async function fetchConfig() {
    try {
      const res = await fetch("/api/ai-agent/config");
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          setConfig(data.config);
          populateForm(data.config);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  function populateForm(c: AgentConfig) {
    setName(c.name);
    setRolePrompt(c.role_prompt);
    setKnowledgeBase(c.knowledge_base ?? "");
    setQualFields((c.qualification_fields ?? []).join(", "));
    setAutoQualify(c.auto_qualify);
    setRespondDms(c.respond_to_dms);
    setRespondGroups(c.respond_to_groups);
    setRespondMentions(c.respond_to_mentions);
    setMaxTokens(c.max_tokens);
    setEscalationKw((c.escalation_keywords ?? []).join(", "));
    setIsActive(c.is_active);
    setAutoCreateDeals(c.auto_create_deals ?? false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const body = {
        id: config?.id,
        name,
        role_prompt: rolePrompt,
        knowledge_base: knowledgeBase || null,
        qualification_fields: qualFields.split(",").map((f) => f.trim()).filter(Boolean),
        auto_qualify: autoQualify,
        respond_to_dms: respondDms,
        respond_to_groups: respondGroups,
        respond_to_mentions: respondMentions,
        max_tokens: maxTokens,
        escalation_keywords: escalationKw.split(",").map((k) => k.trim()).filter(Boolean),
        is_active: isActive,
        auto_create_deals: autoCreateDeals,
      };

      const method = config ? "PUT" : "POST";
      const res = await fetch("/api/ai-agent/config", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
        toast.success("AI Agent configuration saved");
      } else {
        toast.error("Failed to save");
      }
    } finally {
      setSaving(false);
    }
  }

  async function fetchConversations(escalated?: boolean) {
    const params = new URLSearchParams();
    if (escalated) params.set("escalated", "1");
    const res = await fetch(`/api/ai-agent/conversations?${params}`);
    if (res.ok) {
      const data = await res.json();
      setConversations(data.conversations ?? []);
      setConvStats(data.stats ?? { total: 0, escalated: 0, qualified: 0 });
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded-lg bg-white/5 animate-pulse" />
        <div className="h-64 rounded-xl bg-white/[0.02] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            AI Agent
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure AI-powered auto-replies for Telegram conversations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setShowConversations(!showConversations);
              if (!showConversations) fetchConversations(showEscalatedOnly);
            }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showConversations ? "Settings" : "Conversation Log"}
          </button>
        </div>
      </div>

      {showConversations ? (
        /* Conversation log */
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-center">
              <MessageCircle className="mx-auto h-4 w-4 text-blue-400" />
              <p className="text-lg font-bold text-foreground mt-1">{convStats.total}</p>
              <p className="text-[9px] text-muted-foreground">Total Conversations</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-center">
              <AlertTriangle className="mx-auto h-4 w-4 text-amber-400" />
              <p className="text-lg font-bold text-foreground mt-1">{convStats.escalated}</p>
              <p className="text-[9px] text-muted-foreground">Escalated</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-center">
              <UserCheck className="mx-auto h-4 w-4 text-emerald-400" />
              <p className="text-lg font-bold text-foreground mt-1">{convStats.qualified}</p>
              <p className="text-[9px] text-muted-foreground">Lead Data Captured</p>
            </div>
          </div>

          {/* Filter */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowEscalatedOnly(false); fetchConversations(false); }}
              className={cn("text-xs px-2 py-1 rounded", !showEscalatedOnly ? "bg-white/10 text-foreground" : "text-muted-foreground")}
            >
              All
            </button>
            <button
              onClick={() => { setShowEscalatedOnly(true); fetchConversations(true); }}
              className={cn("text-xs px-2 py-1 rounded", showEscalatedOnly ? "bg-amber-500/20 text-amber-400" : "text-muted-foreground")}
            >
              Escalated
            </button>
          </div>

          {/* Conversation list */}
          <div className="space-y-2">
            {conversations.length === 0 ? (
              <p className="text-xs text-muted-foreground/50 text-center py-8">No conversations recorded yet.</p>
            ) : (
              conversations.slice(0, 50).map((conv) => (
                <div key={conv.id} className={cn(
                  "rounded-xl border bg-white/[0.035] p-3 space-y-2",
                  conv.escalated ? "border-amber-500/20" : "border-white/10"
                )}>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>{timeAgo(conv.created_at)}</span>
                    <span className="font-mono">Chat {conv.tg_chat_id}</span>
                    {conv.deal && <span className="text-primary">{conv.deal.deal_name}</span>}
                    {conv.escalated && (
                      <span className="rounded bg-amber-500/20 text-amber-400 px-1.5 py-0.5">
                        Escalated: {conv.escalation_reason}
                      </span>
                    )}
                    {conv.qualification_data && (
                      <span className="rounded bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5">
                        Lead data
                      </span>
                    )}
                  </div>
                  <div className="rounded-lg bg-blue-500/5 border border-blue-500/10 p-2">
                    <p className="text-[9px] text-blue-400 mb-0.5">User</p>
                    <p className="text-xs text-foreground">{conv.user_message}</p>
                  </div>
                  <div className="rounded-lg bg-white/[0.03] border border-white/5 p-2">
                    <p className="text-[9px] text-muted-foreground mb-0.5">AI</p>
                    <p className="text-xs text-muted-foreground">{conv.ai_response}</p>
                  </div>
                  {conv.qualification_data && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {Object.entries(conv.qualification_data).map(([k, v]) => (
                        <span key={k} className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-foreground">
                          <span className="text-muted-foreground">{k}:</span> {v}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        /* Configuration form */
        <div className="space-y-4">
          {/* Active toggle */}
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Agent Status</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isActive ? "AI agent is responding to messages" : "AI agent is disabled"}
              </p>
            </div>
            <button
              onClick={() => setIsActive(!isActive)}
              className={cn(
                "rounded-full px-4 py-1.5 text-xs font-medium transition-colors",
                isActive ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-muted-foreground"
              )}
            >
              {isActive ? "Active" : "Disabled"}
            </button>
          </div>

          {/* Name */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Agent Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Supra BD Assistant" className="text-sm" />
          </div>

          {/* System prompt */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Role / System Prompt</label>
            <textarea
              value={rolePrompt}
              onChange={(e) => setRolePrompt(e.target.value)}
              rows={5}
              className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm font-mono resize-y"
              placeholder="Define the AI agent's personality, role, and behavior guidelines..."
            />
          </div>

          {/* Knowledge base */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Knowledge Base (FAQ / Custom Info)</label>
            <textarea
              value={knowledgeBase}
              onChange={(e) => setKnowledgeBase(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-xs resize-y"
              placeholder="Add company info, FAQs, product details the AI should know about..."
            />
          </div>

          {/* Response scope */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Response Scope</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "DMs", value: respondDms, setter: setRespondDms, hint: "Reply to direct messages" },
                { label: "Groups", value: respondGroups, setter: setRespondGroups, hint: "Reply in group chats" },
                { label: "Mentions only", value: respondMentions, setter: setRespondMentions, hint: "Only when @mentioned" },
              ].map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => opt.setter(!opt.value)}
                  className={cn(
                    "rounded-lg border p-2.5 text-left transition-colors",
                    opt.value ? "border-primary/30 bg-primary/10" : "border-white/10 bg-white/[0.02]"
                  )}
                >
                  <p className="text-xs font-medium text-foreground">{opt.label}</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">{opt.hint}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Lead qualification */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Auto Lead Qualification</label>
              <button
                onClick={() => setAutoQualify(!autoQualify)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors",
                  autoQualify ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-muted-foreground"
                )}
              >
                {autoQualify ? "Enabled" : "Disabled"}
              </button>
            </div>
            {autoQualify && (
              <>
                <Input
                  value={qualFields}
                  onChange={(e) => setQualFields(e.target.value)}
                  placeholder="Fields to extract: company, role, interest, budget_range"
                  className="text-xs font-mono"
                />
                <div className="flex items-center justify-between mt-2">
                  <label className="text-xs font-medium text-muted-foreground">Auto-Create Deals from Qualified Leads</label>
                  <button
                    onClick={() => setAutoCreateDeals(!autoCreateDeals)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors",
                      autoCreateDeals ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-muted-foreground"
                    )}
                  >
                    {autoCreateDeals ? "Enabled" : "Disabled"}
                  </button>
                </div>
                {autoCreateDeals && (
                  <p className="text-[9px] text-muted-foreground">When the AI extracts qualification data, a contact and deal will be auto-created. Fires the &quot;Lead Qualified&quot; workflow trigger.</p>
                )}
              </>
            )}
          </div>

          {/* Escalation */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Escalation Keywords</label>
            <Input
              value={escalationKw}
              onChange={(e) => setEscalationKw(e.target.value)}
              placeholder="urgent, speak to human, manager, pricing"
              className="text-xs font-mono"
            />
            <p className="text-[9px] text-muted-foreground">Messages containing these words will be flagged for human follow-up.</p>
          </div>

          {/* Max tokens */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Max Response Length</label>
            <Input
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              type="number"
              min={100}
              max={2000}
              className="text-xs w-32"
            />
          </div>

          {/* Save */}
          <Button onClick={handleSave} disabled={saving}>
            <Save className="mr-1 h-3.5 w-3.5" />
            {saving ? "Saving..." : "Save Configuration"}
          </Button>
        </div>
      )}
    </div>
  );
}
