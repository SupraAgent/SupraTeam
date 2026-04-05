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
  { value: "group_slug", label: "Group Slug", desc: "Match conversations by group tag" },
  { value: "keyword", label: "Keyword", desc: "Match messages containing a keyword" },
  { value: "contact_tag", label: "Contact Tag", desc: "Match by sender's contact tag" },
  { value: "round_robin", label: "Round Robin", desc: "Distribute evenly across team" },
];

export function AssignmentRulesPanel() {
  const [rules, setRules] = React.useState<AssignmentRule[]>([]);
  const [teamMembers, setTeamMembers] = React.useState<TeamMember[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

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
      }
    } catch {
      toast.error("Network error");
    }
  }

  async function handleMoveUp(index: number) {
    if (index === 0) return;
    const updated = [...rules];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
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
      <div className="space-y-3">
        <div className="h-10 rounded-lg bg-white/5 animate-pulse" />
        <div className="h-10 rounded-lg bg-white/5 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Auto-assign conversations by group tag, keyword, or round-robin. First match wins.
        </p>
        <Button size="sm" onClick={startCreate} disabled={creating}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          New Rule
        </Button>
      </div>

      {/* Create / Edit form */}
      {(creating || editing) && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2.5">
          <h3 className="text-xs font-medium text-foreground">{editing ? "Edit Rule" : "New Rule"}</h3>
          <div className="space-y-2">
            <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Rule name (e.g. DeFi leads to Alice)" className="h-7 text-xs" />
            <select
              value={formType}
              onChange={(e) => setFormType(e.target.value)}
              className="h-7 w-full rounded-md bg-white/5 border border-white/10 text-xs text-foreground px-2"
            >
              {MATCH_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground/50">
              {MATCH_TYPES.find((t) => t.value === formType)?.desc}
            </p>
          </div>

          {formType !== "round_robin" && (
            <Input
              value={formValue}
              onChange={(e) => setFormValue(e.target.value)}
              placeholder={formType === "group_slug" ? "Slug name" : formType === "keyword" ? "Keyword" : "Tag"}
              className="h-7 text-xs"
            />
          )}

          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">
              {formType === "round_robin" ? "Team Pool" : "Assign To"}
            </label>
            {formType !== "round_robin" && (
              <select
                value={formAssignTo}
                onChange={(e) => setFormAssignTo(e.target.value)}
                className="h-7 w-full rounded-md bg-white/5 border border-white/10 text-xs text-foreground px-2 mb-1.5"
              >
                <option value="">Use team pool</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>{m.display_name}</option>
                ))}
              </select>
            )}
            {(formType === "round_robin" || !formAssignTo) && (
              <div className="flex flex-wrap gap-1.5">
                {teamMembers.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => togglePoolMember(m.id)}
                    className={cn(
                      "rounded-md px-2 py-0.5 text-[10px] border transition-colors",
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

          <div className="flex items-center gap-1.5 justify-end">
            <Button size="sm" variant="ghost" onClick={cancelForm} className="h-6 px-2 text-[10px]">
              <X className="mr-0.5 h-3 w-3" /> Cancel
            </Button>
            <Button size="sm" onClick={handleSave} className="h-6 px-2 text-[10px]">
              <Save className="mr-0.5 h-3 w-3" /> {editing ? "Update" : "Create"}
            </Button>
          </div>
        </div>
      )}

      {/* Rules list */}
      {rules.length === 0 && !creating ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-6 text-center">
          <Route className="mx-auto h-6 w-6 text-muted-foreground/30" />
          <p className="mt-1.5 text-xs text-muted-foreground">
            No rules yet. Conversations stay unassigned until manually assigned.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] divide-y divide-white/5">
          {rules.map((rule, idx) => (
            <div key={rule.id} className={cn("px-3 py-2.5 flex items-center gap-2", !rule.enabled && "opacity-50")}>
              <button
                onClick={() => handleMoveUp(idx)}
                disabled={idx === 0}
                className="text-muted-foreground hover:text-foreground disabled:opacity-20 shrink-0"
                title="Move up"
              >
                <GripVertical className="h-3.5 w-3.5" />
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground/40">#{idx + 1}</span>
                  <span className="text-xs font-medium text-foreground truncate">{rule.name}</span>
                  <span className="text-[9px] bg-white/5 rounded px-1 py-0.5 text-muted-foreground shrink-0">
                    {MATCH_TYPES.find((t) => t.value === rule.match_type)?.label}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground truncate">
                  {rule.assign_to
                    ? `${memberName(rule.assign_to)}`
                    : rule.team_pool.length > 0
                    ? `Round-robin: ${rule.team_pool.map(memberName).join(", ")}`
                    : "No target"}
                </p>
              </div>

              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={() => handleToggle(rule)}
                  className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-white/5 transition-colors"
                  title={rule.enabled ? "Disable" : "Enable"}
                >
                  {rule.enabled ? <ToggleRight className="h-3.5 w-3.5 text-emerald-400" /> : <ToggleLeft className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
                <button
                  onClick={() => startEdit(rule)}
                  className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
                  title="Edit"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={() => handleDelete(rule.id)}
                  className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-white/5 text-muted-foreground hover:text-red-400 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
