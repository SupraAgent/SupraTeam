"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  GripVertical,
  ToggleLeft,
  ToggleRight,
  Route,
  Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface AssignmentRule {
  id: string;
  name: string;
  priority: number;
  match_type: string;
  match_value: string | null;
  assign_to: string | null;
  team_pool: string[];
  enabled: boolean;
  created_at: string;
}

interface TeamMember {
  id: string;
  display_name: string;
}

const MATCH_TYPES = [
  { value: "group_slug", label: "Group Tag", desc: "Match conversations by group tag" },
  { value: "keyword", label: "Keyword", desc: "Match messages containing a keyword" },
  { value: "contact_tag", label: "Contact Tag", desc: "Match by sender's contact tag" },
  { value: "round_robin", label: "Round Robin", desc: "Distribute evenly across team" },
];

export default function RoutingPage() {
  const [rules, setRules] = React.useState<AssignmentRule[]>([]);
  const [teamMembers, setTeamMembers] = React.useState<TeamMember[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  // Form state
  const [formName, setFormName] = React.useState("");
  const [formType, setFormType] = React.useState("group_slug");
  const [formValue, setFormValue] = React.useState("");
  const [formAssignTo, setFormAssignTo] = React.useState("");
  const [formTeamPool, setFormTeamPool] = React.useState<string[]>([]);

  const fetchData = React.useCallback(async () => {
    try {
      const [rulesRes, teamRes] = await Promise.all([
        fetch("/api/inbox/rules"),
        fetch("/api/team"),
      ]);
      if (rulesRes.ok) {
        const data = await rulesRes.json();
        setRules(data.rules ?? []);
      }
      if (teamRes.ok) {
        const data = await teamRes.json();
        setTeamMembers(data.members ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  function startCreate() {
    setCreating(true);
    setEditing(null);
    setFormName("");
    setFormType("group_slug");
    setFormValue("");
    setFormAssignTo("");
    setFormTeamPool([]);
  }

  function startEdit(r: AssignmentRule) {
    setEditing(r.id);
    setCreating(false);
    setFormName(r.name);
    setFormType(r.match_type);
    setFormValue(r.match_value ?? "");
    setFormAssignTo(r.assign_to ?? "");
    setFormTeamPool(r.team_pool ?? []);
  }

  function cancelForm() {
    setEditing(null);
    setCreating(false);
  }

  async function handleSave() {
    if (!formName.trim()) {
      toast.error("Rule name required");
      return;
    }

    const payload = {
      ...(editing ? { id: editing } : {}),
      name: formName.trim(),
      match_type: formType,
      match_value: formType !== "round_robin" ? formValue.trim() || null : null,
      assign_to: formAssignTo || null,
      team_pool: formTeamPool,
      priority: editing ? rules.find((r) => r.id === editing)?.priority ?? 0 : rules.length,
    };

    try {
      const res = await fetch("/api/inbox/rules", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success(editing ? "Rule updated" : "Rule created");
        cancelForm();
        fetchData();
      } else {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        toast.error(err.error || "Failed to save");
      }
    } catch {
      toast.error("Network error");
    }
  }

  async function handleToggle(rule: AssignmentRule) {
    try {
      const res = await fetch("/api/inbox/rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id, enabled: !rule.enabled }),
      });
      if (res.ok) {
        setRules((prev) =>
          prev.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r))
        );
        toast.success(rule.enabled ? "Rule disabled" : "Rule enabled");
      }
    } catch {
      toast.error("Failed to toggle rule");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this assignment rule?")) return;
    try {
      const res = await fetch(`/api/inbox/rules?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Rule deleted");
        setRules((prev) => prev.filter((r) => r.id !== id));
      } else {
        toast.error("Failed to delete");
      }
    } catch {
      toast.error("Network error");
    }
  }

  async function handleMoveUp(index: number) {
    if (index === 0) return;
    const updated = [...rules];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    // Update priorities
    const promises = updated.map((r, i) =>
      fetch("/api/inbox/rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id, priority: i }),
      })
    );
    setRules(updated.map((r, i) => ({ ...r, priority: i })));
    await Promise.all(promises);
  }

  function togglePoolMember(userId: string) {
    setFormTeamPool((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  const memberName = (id: string) => teamMembers.find((m) => m.id === id)?.display_name ?? "Unknown";

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
          <h2 className="text-lg font-semibold text-foreground">Assignment Rules</h2>
          <p className="text-sm text-muted-foreground">
            Auto-assign incoming conversations based on group tags, keywords, or round-robin.
          </p>
        </div>
        <Button size="sm" onClick={startCreate} disabled={creating}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          New Rule
        </Button>
      </div>

      {/* Explainer */}
      <details className="group rounded-xl border border-white/10 bg-white/[0.02]">
        <summary className="flex items-center gap-2 px-4 py-2.5 cursor-pointer list-none hover:bg-white/5 transition-colors rounded-xl [&::-webkit-details-marker]:hidden">
          <Lightbulb className="h-3.5 w-3.5 text-amber-400/70 shrink-0" />
          <span className="text-xs text-muted-foreground">How do assignment rules work?</span>
          <svg className="h-3 w-3 text-muted-foreground/50 ml-auto transition-transform group-open:rotate-180" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 4.5l3 3 3-3" /></svg>
        </summary>
        <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
          <p className="text-xs text-muted-foreground">
            Rules are evaluated top-to-bottom — first match wins. If no rule matches, the conversation stays unassigned for manual pickup. Manual assignments are never overridden.
          </p>
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-foreground/80">Examples</p>
            <div className="grid gap-2 text-[11px] text-muted-foreground">
              <div className="flex gap-2 items-start">
                <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">Group Tag</span>
                <span>&quot;DeFi leads to Alice&quot; — any conversation from a group tagged <span className="text-primary/70">defi</span> gets assigned to Alice automatically.</span>
              </div>
              <div className="flex gap-2 items-start">
                <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">Keyword</span>
                <span>&quot;Pricing inquiries&quot; — messages containing <span className="text-primary/70">pricing</span> get routed to your sales lead.</span>
              </div>
              <div className="flex gap-2 items-start">
                <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">Contact Tag</span>
                <span>&quot;VIP fast-track&quot; — conversations from contacts tagged <span className="text-primary/70">vip</span> go straight to a senior team member.</span>
              </div>
              <div className="flex gap-2 items-start">
                <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">Round Robin</span>
                <span>&quot;General support&quot; — distribute all unmatched conversations evenly across a team pool.</span>
              </div>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground/50">
            Tip: Put specific rules (Group Tag, Keyword) above catch-all rules (Round Robin).
          </p>
        </div>
      </details>

      {/* Create / Edit form */}
      {(creating || editing) && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
          <h3 className="text-sm font-medium text-foreground">{editing ? "Edit Rule" : "New Rule"}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">Rule Name *</label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. DeFi leads to Alice" className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">Match Type *</label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                className="h-8 w-full rounded-md bg-white/5 border border-white/10 text-sm text-foreground px-2"
              >
                {MATCH_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                {MATCH_TYPES.find((t) => t.value === formType)?.desc}
              </p>
            </div>
          </div>

          {formType !== "round_robin" && (
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">
                Match Value {formType === "group_slug" ? "(tag name)" : formType === "keyword" ? "(keyword)" : "(tag)"}
              </label>
              <Input value={formValue} onChange={(e) => setFormValue(e.target.value)} placeholder={formType === "group_slug" ? "defi" : formType === "keyword" ? "pricing" : "vip"} className="h-8 text-sm" />
            </div>
          )}

          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">
              {formType === "round_robin" ? "Team Pool *" : "Assign To (or select pool for round-robin)"}
            </label>
            {formType !== "round_robin" && (
              <select
                value={formAssignTo}
                onChange={(e) => setFormAssignTo(e.target.value)}
                className="h-8 w-full rounded-md bg-white/5 border border-white/10 text-sm text-foreground px-2 mb-2"
              >
                <option value="">Use team pool instead</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>{m.display_name}</option>
                ))}
              </select>
            )}
            {(formType === "round_robin" || !formAssignTo) && (
              <div className="flex flex-wrap gap-2">
                {teamMembers.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => togglePoolMember(m.id)}
                    className={cn(
                      "rounded-md px-2 py-1 text-xs border transition-colors",
                      formTeamPool.includes(m.id)
                        ? "bg-primary/20 border-primary/30 text-primary"
                        : "bg-white/5 border-white/10 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {m.display_name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSave}>
              <Save className="mr-1 h-3.5 w-3.5" />
              {editing ? "Update" : "Create"}
            </Button>
            <Button size="sm" variant="ghost" onClick={cancelForm}>
              <X className="mr-1 h-3.5 w-3.5" />
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Rules list */}
      {rules.length === 0 && !creating ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center">
          <Route className="mx-auto h-8 w-8 text-muted-foreground/30" />
          <p className="mt-2 text-sm text-muted-foreground">
            No assignment rules yet. Conversations will stay in &quot;Unassigned&quot; until manually assigned.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] divide-y divide-white/5">
          {rules.map((rule, idx) => (
            <div key={rule.id} className={cn("px-4 py-3 flex items-center gap-3", !rule.enabled && "opacity-50")}>
              {/* Priority drag handle */}
              <button
                onClick={() => handleMoveUp(idx)}
                className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                title="Move up in priority"
                disabled={idx === 0}
              >
                <GripVertical className="h-3.5 w-3.5" />
              </button>

              {/* Rule info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground/40">#{idx + 1}</span>
                  <span className="text-sm font-medium text-foreground">{rule.name}</span>
                  <span className="text-[10px] bg-white/5 rounded px-1.5 py-0.5 text-muted-foreground">
                    {MATCH_TYPES.find((t) => t.value === rule.match_type)?.label}
                  </span>
                  {rule.match_value && (
                    <span className="text-[10px] text-primary/60 bg-primary/5 rounded px-1.5 py-0.5">
                      {rule.match_value}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground truncate">
                  {rule.assign_to
                    ? `→ ${memberName(rule.assign_to)}`
                    : rule.team_pool.length > 0
                    ? `→ Round-robin: ${rule.team_pool.map(memberName).join(", ")}`
                    : "No assignment target"}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleToggle(rule)}
                  className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
                  title={rule.enabled ? "Disable" : "Enable"}
                >
                  {rule.enabled ? <ToggleRight className="h-4 w-4 text-emerald-400" /> : <ToggleLeft className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => startEdit(rule)}
                  className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
                  title="Edit"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(rule.id)}
                  className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-white/5 text-muted-foreground hover:text-red-400 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
