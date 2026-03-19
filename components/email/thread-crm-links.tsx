"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ContactAvatar } from "./contact-avatar";

type CrmLink = {
  id: string;
  thread_id: string;
  deal_id: string | null;
  contact_id: string | null;
  auto_linked: boolean;
  crm_deals: { id: string; deal_name: string; board_type: string } | null;
  crm_contacts: { id: string; name: string; email: string; company: string | null } | null;
};

type ThreadCrmLinksProps = {
  threadId: string;
  fromEmails: string[];
  toEmails: string[];
};

export function ThreadCrmLinks({ threadId, fromEmails, toEmails }: ThreadCrmLinksProps) {
  const [links, setLinks] = React.useState<CrmLink[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [autoLinkDone, setAutoLinkDone] = React.useState(false);

  // Fetch existing links
  React.useEffect(() => {
    setLoading(true);
    fetch(`/api/email/threads/${threadId}/links`)
      .then((r) => r.json())
      .then((json) => {
        setLinks(json.data ?? []);
        if ((json.data ?? []).length > 0) setAutoLinkDone(true);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [threadId]);

  // Auto-link if no existing links
  React.useEffect(() => {
    if (loading || autoLinkDone || links.length > 0) return;
    setAutoLinkDone(true);

    fetch("/api/email/threads/auto-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        thread_id: threadId,
        from_emails: fromEmails,
        to_emails: toEmails,
      }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.data?.links?.length > 0) {
          setLinks(json.data.links);
        }
      })
      .catch(() => {});
  }, [loading, autoLinkDone, links.length, threadId, fromEmails, toEmails]);

  if (loading) return null;
  if (links.length === 0) return null;

  return (
    <div className="border-b border-white/10 px-4 py-2 shrink-0">
      <div className="flex items-center gap-2 flex-wrap">
        {links.map((link) => (
          <React.Fragment key={link.id}>
            {link.crm_contacts && (
              <a
                href={`/contacts/${link.crm_contacts.id}`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition-colors",
                  "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
                )}
              >
                <ContactAvatar email={link.crm_contacts.email} name={link.crm_contacts.name} size={16} />
                <span>{link.crm_contacts.name}</span>
                {link.auto_linked && (
                  <span className="text-[8px] text-blue-400/50 ml-0.5">auto</span>
                )}
              </a>
            )}
            {link.crm_deals && (
              <a
                href={`/pipeline?deal=${link.crm_deals.id}`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition-colors",
                  "bg-primary/10 text-primary hover:bg-primary/20"
                )}
              >
                <DealIcon className="h-3 w-3" />
                <span>{link.crm_deals.deal_name}</span>
                <span className="text-[8px] text-primary/50">{link.crm_deals.board_type}</span>
              </a>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function DealIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}
