"use client";

import type { Contact } from "@/lib/types";
import { timeAgo, cn } from "@/lib/utils";

const LIFECYCLE_COLORS: Record<string, string> = {
  prospect: "bg-slate-500/20 text-slate-400",
  lead: "bg-blue-500/20 text-blue-400",
  opportunity: "bg-amber-500/20 text-amber-400",
  customer: "bg-green-500/20 text-green-400",
  churned: "bg-red-500/20 text-red-400",
  inactive: "bg-gray-500/20 text-gray-400",
};

function QualityDots({ score }: { score: number }) {
  const level = score >= 80 ? 4 : score >= 60 ? 3 : score >= 40 ? 2 : score >= 20 ? 1 : 0;
  const color = level >= 3 ? "bg-green-400" : level >= 2 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex gap-0.5" title={`Quality: ${score}%`}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={cn("h-1.5 w-1.5 rounded-full", i < level ? color : "bg-white/10")} />
      ))}
    </div>
  );
}

function OnChainBadge({ score }: { score: number }) {
  if (score === 0) return <span className="text-muted-foreground/30 text-[10px]">-</span>;
  const label = score >= 70 ? "Active" : score >= 40 ? "Some" : "Low";
  const color = score >= 70
    ? "bg-emerald-500/20 text-emerald-400"
    : score >= 40
    ? "bg-amber-500/20 text-amber-400"
    : "bg-slate-500/20 text-slate-400";
  return (
    <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", color)} title={`On-chain: ${score}`}>
      {label}
    </span>
  );
}

function EnrichmentBadge({ contact }: { contact: Contact }) {
  const fields = [
    { key: "name", filled: !!contact.name },
    { key: "email", filled: !!contact.email },
    { key: "telegram", filled: !!contact.telegram_username },
    { key: "x_handle", filled: !!contact.x_handle },
    { key: "wallet", filled: !!contact.wallet_address },
  ];
  const filled = fields.filter((f) => f.filled).length;
  const total = fields.length;
  const color = filled >= 5
    ? "text-emerald-400"
    : filled >= 3
    ? "text-amber-400"
    : "text-red-400";
  const bgColor = filled >= 5
    ? "bg-emerald-500/20"
    : filled >= 3
    ? "bg-amber-500/20"
    : "bg-red-500/20";
  return (
    <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", bgColor, color)} title={fields.map((f) => `${f.key}: ${f.filled ? "yes" : "no"}`).join(", ")}>
      {filled}/{total}
    </span>
  );
}

function EngagementBadge({ score }: { score: number }) {
  const label = score >= 70 ? "Hot" : score >= 40 ? "Warm" : score > 0 ? "Cool" : "-";
  const color = score >= 70
    ? "bg-red-500/20 text-red-400"
    : score >= 40
    ? "bg-amber-500/20 text-amber-400"
    : score > 0
    ? "bg-blue-500/20 text-blue-400"
    : "text-muted-foreground/30";
  if (score === 0) return <span className="text-muted-foreground/30 text-[10px]">-</span>;
  return (
    <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", color)} title={`Engagement: ${score}`}>
      {label}
    </span>
  );
}

type ContactTableProps = {
  contacts: Contact[];
  onRowClick: (contact: Contact) => void;
  dealCountMap?: Record<string, number>;
  selected?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: () => void;
};

export function ContactTable({ contacts, onRowClick, dealCountMap, selected, onToggleSelect, onToggleSelectAll }: ContactTableProps) {
  if (contacts.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No contacts match your filters.
        </p>
      </div>
    );
  }

  const allSelected = selected && contacts.length > 0 && contacts.every((c) => selected.has(c.id));

  return (
    <>
      {/* Desktop table */}
      <div className="hidden sm:block rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.02]">
              {onToggleSelect && (
                <th className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={onToggleSelectAll}
                    className="rounded border-white/20 bg-white/5"
                  />
                </th>
              )}
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Name</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Lifecycle</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Company</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Telegram</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Email</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">X</th>
              <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">On-Chain</th>
              <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">Enriched</th>
              <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">Quality</th>
              <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">Engagement</th>
              {dealCountMap && <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground">Deals</th>}
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Created</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => (
              <tr
                key={contact.id}
                className={cn(
                  "border-b border-white/5 hover:bg-white/[0.03] cursor-pointer transition-colors",
                  selected?.has(contact.id) && "bg-primary/5"
                )}
              >
                {onToggleSelect && (
                  <td className="w-10 px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected?.has(contact.id) ?? false}
                      onChange={() => onToggleSelect(contact.id)}
                      className="rounded border-white/20 bg-white/5"
                    />
                  </td>
                )}
                <td className="px-4 py-3 text-foreground font-medium" onClick={() => onRowClick(contact)}>
                  {contact.name}
                  {contact.source && contact.source !== "manual" && (
                    <span className="ml-1.5 text-[9px] text-muted-foreground/40">{contact.source.replace("_", " ")}</span>
                  )}
                </td>
                <td className="px-4 py-3" onClick={() => onRowClick(contact)}>
                  <span className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                    LIFECYCLE_COLORS[contact.lifecycle_stage] ?? LIFECYCLE_COLORS.prospect
                  )}>
                    {contact.lifecycle_stage ?? "prospect"}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground" onClick={() => onRowClick(contact)}>{contact.company ?? "-"}</td>
                <td className="px-4 py-3" onClick={() => onRowClick(contact)}>
                  {contact.telegram_username ? (
                    <span className="text-primary">@{contact.telegram_username}</span>
                  ) : (
                    <span className="text-muted-foreground/50">-</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground" onClick={() => onRowClick(contact)}>{contact.email ?? "-"}</td>
                <td className="px-4 py-3" onClick={() => onRowClick(contact)}>
                  {contact.x_handle ? (
                    <span className="text-muted-foreground">@{contact.x_handle}</span>
                  ) : (
                    <span className="text-muted-foreground/50">-</span>
                  )}
                </td>
                <td className="px-4 py-3" onClick={() => onRowClick(contact)}>
                  <div className="flex justify-center">
                    <OnChainBadge score={contact.on_chain_score} />
                  </div>
                </td>
                <td className="px-4 py-3" onClick={() => onRowClick(contact)}>
                  <div className="flex justify-center">
                    <EnrichmentBadge contact={contact} />
                  </div>
                </td>
                <td className="px-4 py-3" onClick={() => onRowClick(contact)}>
                  <div className="flex justify-center">
                    <QualityDots score={contact.quality_score} />
                  </div>
                </td>
                <td className="px-4 py-3" onClick={() => onRowClick(contact)}>
                  <div className="flex justify-center">
                    <EngagementBadge score={contact.engagement_score ?? 0} />
                  </div>
                </td>
                {dealCountMap && (
                  <td className="px-4 py-3 text-center" onClick={() => onRowClick(contact)}>
                    {dealCountMap[contact.id] ? (
                      <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        {dealCountMap[contact.id]}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/30 text-xs">0</span>
                    )}
                  </td>
                )}
                <td className="px-4 py-3 text-muted-foreground text-xs" onClick={() => onRowClick(contact)}>{timeAgo(contact.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="sm:hidden space-y-2">
        {contacts.map((contact) => (
          <div
            key={contact.id}
            onClick={() => onRowClick(contact)}
            className={cn(
              "rounded-xl border border-white/10 bg-white/[0.035] p-3 cursor-pointer transition hover:bg-white/[0.06] active:bg-white/[0.08]",
              selected?.has(contact.id) && "border-primary/40 bg-primary/5"
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {onToggleSelect && (
                  <input
                    type="checkbox"
                    checked={selected?.has(contact.id) ?? false}
                    onChange={(e) => { e.stopPropagation(); onToggleSelect(contact.id); }}
                    className="rounded border-white/20 bg-white/5"
                  />
                )}
                <p className="text-sm font-medium text-foreground">{contact.name}</p>
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                  LIFECYCLE_COLORS[contact.lifecycle_stage] ?? LIFECYCLE_COLORS.prospect
                )}>
                  {contact.lifecycle_stage ?? "prospect"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <QualityDots score={contact.quality_score} />
                <EngagementBadge score={contact.engagement_score ?? 0} />
                {dealCountMap && dealCountMap[contact.id] && (
                  <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    {dealCountMap[contact.id]} deal{dealCountMap[contact.id] !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              {contact.company && <span>{contact.company}</span>}
              {contact.company && contact.telegram_username && <span className="text-white/20">·</span>}
              {contact.telegram_username && <span className="text-primary">@{contact.telegram_username}</span>}
              {contact.x_handle && <><span className="text-white/20">·</span><span className="text-muted-foreground/70">𝕏 @{contact.x_handle}</span></>}
            </div>
            {contact.email && (
              <p className="mt-0.5 text-[11px] text-muted-foreground/60 truncate">{contact.email}</p>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
