"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";
import {
  User, Building2, Phone, Mail, ExternalLink,
  Plus, MessageCircle, Globe, Briefcase,
} from "lucide-react";
import { useThreadContext } from "@/lib/plugins/thread-context";

interface ContactData {
  contact: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    company: string | null;
    title: string | null;
    telegram_username: string | null;
    x_handle: string | null;
    lifecycle_stage: string | null;
    quality_score: number | null;
    engagement_score: number | null;
    source: string | null;
    created_at: string;
  };
  deals: {
    id: string;
    deal_name: string;
    board_type: string;
    value: number | null;
    outcome: string;
    stage_id: string;
    pipeline_stages: { id: string; name: string; color: string } | null;
  }[];
  groups: {
    id: string;
    group_name: string;
    group_type: string;
    member_count: number;
  }[];
  lastTouchpoint: string;
}

export function ContactCardPanel() {
  const { email, senderName } = useThreadContext();
  const [data, setData] = React.useState<ContactData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [notFound, setNotFound] = React.useState(false);

  React.useEffect(() => {
    if (!email) {
      setData(null);
      setNotFound(false);
      return;
    }

    setLoading(true);
    setNotFound(false);

    fetch(`/api/plugins/contact-card?email=${encodeURIComponent(email)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        if (json.data?.contact) {
          setData(json.data);
          setNotFound(false);
        } else {
          setData(null);
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [email]);

  if (!email) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-muted-foreground gap-2">
        <User className="h-8 w-8 opacity-20" />
        <p className="text-xs">Select an email thread to see contact info</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-white/5 animate-pulse" />
          <div className="space-y-1.5 flex-1">
            <div className="h-4 w-32 rounded bg-white/5 animate-pulse" />
            <div className="h-3 w-24 rounded bg-white/5 animate-pulse" />
          </div>
        </div>
        <div className="h-3 w-full rounded bg-white/5 animate-pulse" />
        <div className="h-3 w-3/4 rounded bg-white/5 animate-pulse" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-white/5 flex items-center justify-center">
            <User className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{senderName || email}</p>
            <p className="text-xs text-muted-foreground">{email}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Not in CRM</p>
        <Link
          href={`/contacts?action=create&email=${encodeURIComponent(email)}&name=${encodeURIComponent(senderName || "")}`}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition"
        >
          <Plus className="h-3 w-3" />
          Add to CRM
        </Link>
      </div>
    );
  }

  if (!data) return null;

  const { contact, deals, lastTouchpoint } = data;
  const activeDeals = deals.filter((d) => d.outcome === "open");

  return (
    <div className="space-y-4">
      {/* Contact header */}
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-sm font-semibold text-primary">
            {contact.name?.charAt(0)?.toUpperCase() || "?"}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <Link
            href={`/contacts/${contact.id}`}
            className="text-sm font-medium text-foreground hover:text-primary transition-colors"
          >
            {contact.name}
          </Link>
          <div className="flex items-center gap-2 mt-0.5">
            {contact.title && (
              <span className="text-[10px] text-muted-foreground">{contact.title}</span>
            )}
            {contact.company && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <Building2 className="h-2.5 w-2.5" />
                {contact.company}
              </span>
            )}
          </div>
          {contact.lifecycle_stage && (
            <span className={cn(
              "inline-block mt-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
              contact.lifecycle_stage === "customer" ? "bg-green-500/10 text-green-400" :
              contact.lifecycle_stage === "lead" ? "bg-blue-500/10 text-blue-400" :
              contact.lifecycle_stage === "opportunity" ? "bg-yellow-500/10 text-yellow-400" :
              "bg-white/5 text-muted-foreground"
            )}>
              {contact.lifecycle_stage}
            </span>
          )}
        </div>
      </div>

      {/* Contact details */}
      <div className="space-y-1.5">
        <ContactDetail icon={Mail} label={contact.email} />
        {contact.phone && <ContactDetail icon={Phone} label={contact.phone} />}
        {contact.telegram_username && (
          <ContactDetail icon={MessageCircle} label={`@${contact.telegram_username}`} />
        )}
        {contact.x_handle && (
          <ContactDetail icon={Globe} label={`@${contact.x_handle}`} />
        )}
      </div>

      {/* Scores */}
      {(contact.quality_score !== null || contact.engagement_score !== null) && (
        <div className="flex items-center gap-3">
          {contact.quality_score !== null && (
            <div className="text-center">
              <div className="text-xs font-semibold text-foreground">{contact.quality_score}</div>
              <div className="text-[10px] text-muted-foreground">Quality</div>
            </div>
          )}
          {contact.engagement_score !== null && (
            <div className="text-center">
              <div className="text-xs font-semibold text-foreground">{contact.engagement_score}</div>
              <div className="text-[10px] text-muted-foreground">Engagement</div>
            </div>
          )}
        </div>
      )}

      {/* Active deals */}
      {activeDeals.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            Active Deals ({activeDeals.length})
          </h4>
          <div className="space-y-1">
            {activeDeals.map((deal) => (
              <Link
                key={deal.id}
                href={`/pipeline?deal=${deal.id}`}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5 transition group"
              >
                {deal.pipeline_stages?.color && (
                  <div
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: deal.pipeline_stages.color }}
                  />
                )}
                <span className="text-xs text-foreground truncate flex-1 group-hover:text-primary transition-colors">
                  {deal.deal_name}
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {deal.pipeline_stages?.name}
                </span>
                {deal.value !== null && (
                  <span className="text-[10px] text-primary font-medium shrink-0">
                    ${(deal.value / 1000).toFixed(0)}k
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="flex items-center gap-2 pt-1 border-t border-white/5">
        <Link
          href={`/contacts/${contact.id}`}
          className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
        >
          <ExternalLink className="h-3 w-3" />
          Profile
        </Link>
        <Link
          href={`/pipeline?action=create&contact=${contact.id}`}
          className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
        >
          <Briefcase className="h-3 w-3" />
          New Deal
        </Link>
        {contact.telegram_username && (
          <a
            href={`https://t.me/${contact.telegram_username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
          >
            <MessageCircle className="h-3 w-3" />
            TG
          </a>
        )}
      </div>

      {/* Last touched */}
      <div className="text-[10px] text-muted-foreground">
        Last activity: {timeAgo(lastTouchpoint)}
      </div>
    </div>
  );
}

function ContactDetail({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  );
}
