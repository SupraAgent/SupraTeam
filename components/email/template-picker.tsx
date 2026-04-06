"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { EmailTemplate } from "@/lib/email/types";
import { toast } from "sonner";

const BD_EMAIL_STARTERS: { name: string; subject: string; body: string; variables: string[] }[] = [
  {
    name: "Partnership Intro",
    subject: "Partnership Opportunity — {{company_name}}",
    body: "Hi {{contact_name}},\n\nI'm reaching out from {{our_company}} regarding a potential partnership with {{company_name}}.\n\nWe've been following your work in the space and believe there's strong alignment between our ecosystems. I'd love to explore how we can collaborate.\n\nWould you have 20 minutes this week for an intro call?\n\nBest,\n{{sender_name}}",
    variables: ["contact_name", "company_name", "our_company", "sender_name"],
  },
  {
    name: "Follow-Up — No Reply",
    subject: "Re: Partnership Opportunity — {{company_name}}",
    body: "Hi {{contact_name}},\n\nJust following up on my previous message. I understand things get busy — wanted to bump this in case it got buried.\n\nHappy to work around your schedule if there's interest in connecting.\n\nBest,\n{{sender_name}}",
    variables: ["contact_name", "company_name", "sender_name"],
  },
  {
    name: "Meeting Confirmation",
    subject: "Confirmed: {{meeting_topic}} — {{date}}",
    body: "Hi {{contact_name}},\n\nConfirming our call on {{date}} at {{time}}.\n\nAgenda:\n- Intro & ecosystem overview\n- Integration discussion\n- Next steps\n\nMeeting link: {{meeting_link}}\n\nLooking forward to it.\n\nBest,\n{{sender_name}}",
    variables: ["contact_name", "meeting_topic", "date", "time", "meeting_link", "sender_name"],
  },
  {
    name: "Post-Call Summary",
    subject: "Summary: {{meeting_topic}} — Next Steps",
    body: "Hi {{contact_name}},\n\nGreat connecting today. Here's a quick recap:\n\n**Discussed:**\n- {{summary_point_1}}\n- {{summary_point_2}}\n\n**Next Steps:**\n- {{action_item_1}}\n- {{action_item_2}}\n\nLet me know if I missed anything. Happy to keep the momentum going.\n\nBest,\n{{sender_name}}",
    variables: ["contact_name", "meeting_topic", "summary_point_1", "summary_point_2", "action_item_1", "action_item_2", "sender_name"],
  },
  {
    name: "Proposal / Integration Brief",
    subject: "Integration Proposal: {{our_company}} x {{company_name}}",
    body: "Hi {{contact_name}},\n\nFollowing our conversation, I've put together a brief integration proposal.\n\n**Overview:** {{integration_summary}}\n\n**Timeline:** {{timeline}}\n\n**Resources Needed:** {{resources}}\n\nI've attached the full brief for your team's review. Happy to jump on a call to walk through any questions.\n\nBest,\n{{sender_name}}",
    variables: ["contact_name", "company_name", "our_company", "integration_summary", "timeline", "resources", "sender_name"],
  },
];

type TemplatePickerProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (template: EmailTemplate) => void;
};

export function TemplatePicker({ open, onClose, onSelect }: TemplatePickerProps) {
  const [templates, setTemplates] = React.useState<EmailTemplate[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/email/templates")
      .then((r) => r.json())
      .then((json) => setTemplates(json.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  React.useEffect(() => {
    if (!open) { setQuery(""); setSelectedIndex(0); }
  }, [open]);

  const filtered = React.useMemo(() => {
    if (!query) return templates;
    const q = query.toLowerCase();
    return templates.filter((t) => t.name.toLowerCase().includes(q) || t.subject?.toLowerCase().includes(q));
  }, [templates, query]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[selectedIndex]) {
      e.preventDefault();
      onSelect(filtered[selectedIndex]);
      onClose();
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[15vh]">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
        style={{ backgroundColor: "hsl(var(--surface-4))" }}
      >
        {/* Search */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
          <TemplateIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search templates..."
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
          />
          <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            ⌘;
          </kbd>
        </div>

        {/* Template list */}
        <div className="max-h-[300px] overflow-y-auto p-2">
          {loading ? (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                {templates.length === 0 ? "No templates yet" : `No match for "${query}"`}
              </p>
              {templates.length === 0 && (
                <>
                  <p className="text-[10px] text-muted-foreground/50 mt-1">
                    Create templates in Settings &gt; Email
                  </p>
                  <button
                    className="mt-3 text-xs text-primary hover:text-primary/80 font-medium"
                    onClick={async () => {
                      setLoading(true);
                      try {
                        for (const t of BD_EMAIL_STARTERS) {
                          await fetch("/api/email/templates", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ name: t.name, subject: t.subject, body: t.body, variables: t.variables, board_type: "BD" }),
                          });
                        }
                        const res = await fetch("/api/email/templates");
                        if (res.ok) { const json = await res.json(); setTemplates(json.data ?? []); }
                        toast.success(`Loaded ${BD_EMAIL_STARTERS.length} BD email templates`);
                      } catch {
                        toast.error("Failed to load templates");
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    Load BD Starter Templates
                  </button>
                </>
              )}
            </div>
          ) : (
            filtered.map((t, i) => (
              <button
                key={t.id}
                onClick={() => { onSelect(t); onClose(); }}
                onMouseEnter={() => setSelectedIndex(i)}
                className={cn(
                  "w-full text-left rounded-lg px-3 py-2.5 transition-colors",
                  selectedIndex === i ? "bg-white/[0.08]" : "hover:bg-white/[0.03]"
                )}
              >
                <p className="text-sm text-foreground">{t.name}</p>
                {t.subject && (
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                    Subject: {t.subject}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground/50 truncate mt-0.5">
                  {t.body.replace(/<[^>]+>/g, "").slice(0, 80)}
                </p>
                {t.variables.length > 0 && (
                  <div className="flex gap-1 mt-1">
                    {t.variables.map((v) => (
                      <span key={v} className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] text-primary">
                        {`{${v}}`}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function TemplateIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}
