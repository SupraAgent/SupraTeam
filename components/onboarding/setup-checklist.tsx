"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ArrowRight, Bot, Users, Kanban, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

type ChecklistItem = {
  key: string;
  label: string;
  description: string;
  href: string;
  icon: React.ElementType;
  done: boolean;
};

type SetupChecklistProps = {
  hasBotToken: boolean;
  hasGroups: boolean;
  hasDeals: boolean;
  hasContacts: boolean;
};

export function SetupChecklist({ hasBotToken, hasGroups, hasDeals, hasContacts }: SetupChecklistProps) {
  const items: ChecklistItem[] = [
    {
      key: "bot",
      label: "Connect Telegram Bot",
      description: "Add your bot token in Settings to enable group messaging.",
      href: "/settings/telegram",
      icon: Bot,
      done: hasBotToken,
    },
    {
      key: "groups",
      label: "Add Telegram Groups",
      description: "Add the bot as admin to your Telegram groups.",
      href: "/groups",
      icon: Users,
      done: hasGroups,
    },
    {
      key: "deals",
      label: "Create Your First Deal",
      description: "Start tracking your pipeline with BD, Marketing, or Admin deals.",
      href: "/pipeline",
      icon: Kanban,
      done: hasDeals,
    },
    {
      key: "contacts",
      label: "Add Contacts",
      description: "Import from Telegram or add contacts manually.",
      href: "/contacts",
      icon: Shield,
      done: hasContacts,
    },
  ];

  const completedCount = items.filter((i) => i.done).length;

  // Don't show if all done
  if (completedCount === items.length) return null;

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/[0.03] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-primary/10">
        <div>
          <h2 className="text-sm font-medium text-foreground">Get Started with SupraCRM</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {completedCount}/{items.length} steps completed
          </p>
        </div>
        {/* Progress bar */}
        <div className="w-24 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${(completedCount / items.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="divide-y divide-white/5">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 transition hover:bg-white/[0.03]",
                item.done && "opacity-60"
              )}
            >
              <div
                className={cn(
                  "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                  item.done ? "bg-primary/20" : "bg-white/5"
                )}
              >
                {item.done ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : (
                  <Icon className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm font-medium", item.done ? "text-muted-foreground line-through" : "text-foreground")}>
                  {item.label}
                </p>
                <p className="text-xs text-muted-foreground/60 truncate">{item.description}</p>
              </div>
              {!item.done && <ArrowRight className="h-4 w-4 text-muted-foreground/30 shrink-0" />}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
