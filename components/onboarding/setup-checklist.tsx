"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ArrowRight, Bot, Users, Kanban, Shield, Mail, X, Sparkles, Rocket, Link2 } from "lucide-react";
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
  hasEmail?: boolean;
  hasLinkedChats?: boolean;
  onLinkConversationClick?: () => void;
};

export function SetupChecklist({ hasBotToken, hasGroups, hasDeals, hasContacts, hasEmail, hasLinkedChats, onLinkConversationClick }: SetupChecklistProps) {
  const [dismissed, setDismissed] = React.useState(false);
  const [showWelcome, setShowWelcome] = React.useState(false);
  const dialogRef = React.useRef<HTMLDivElement>(null);

  // Show welcome modal on first visit
  React.useEffect(() => {
    const seen = localStorage.getItem("supracrm:welcome-seen");
    if (!seen) setShowWelcome(true);
  }, []);

  // Focus trap + Escape key for welcome modal
  React.useEffect(() => {
    if (!showWelcome) return;

    // Focus first interactive element
    const timer = setTimeout(() => {
      const firstBtn = dialogRef.current?.querySelector("a, button");
      (firstBtn as HTMLElement)?.focus();
    }, 50);

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        dismissWelcome();
        return;
      }
      // Trap Tab within dialog
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          "a, button, input, [tabindex]:not([tabindex='-1'])"
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [showWelcome]);

  function dismissWelcome() {
    setShowWelcome(false);
    localStorage.setItem("supracrm:welcome-seen", "1");
  }

  const items: ChecklistItem[] = [
    {
      key: "bot",
      label: "Connect Telegram Bot",
      description: "Add your bot token in Settings to enable group messaging.",
      href: "/settings/integrations",
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
      key: "link_conversation",
      label: "Link a Conversation to a Deal",
      description: "Connect a Telegram conversation to track messages in your pipeline.",
      href: "#",
      icon: Link2,
      done: hasLinkedChats ?? false,
    },
    {
      key: "contacts",
      label: "Add Contacts",
      description: "Import from Telegram or add contacts manually.",
      href: "/contacts",
      icon: Shield,
      done: hasContacts,
    },
    {
      key: "email",
      label: "Connect Email",
      description: "Link Gmail or Outlook for integrated email tracking.",
      href: "/settings/integrations/email",
      icon: Mail,
      done: hasEmail ?? false,
    },
  ];

  const completedCount = items.filter((i) => i.done).length;

  // Don't show if all done or dismissed
  if (completedCount === items.length || dismissed) return null;

  return (
    <>
      {/* Welcome modal for first-time users */}
      {showWelcome && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 motion-safe:animate-fade-in"
          onClick={(e) => { if (e.target === e.currentTarget) dismissWelcome(); }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="welcome-title"
            className="relative mx-0 sm:mx-4 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-primary/20 bg-[hsl(225,32%,7%)] p-5 sm:p-6 space-y-4 motion-safe:animate-dropdown-in safe-area-bottom"
          >
            <button
              onClick={dismissWelcome}
              className="absolute top-2 right-2 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground motion-safe:transition-colors"
              aria-label="Close welcome dialog"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                <Rocket className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 id="welcome-title" className="text-lg font-semibold text-foreground">Welcome to SupraTeam</h2>
                <p className="text-xs text-muted-foreground">Telegram-native CRM for your team</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-start gap-3 rounded-xl bg-white/[0.03] p-3">
                <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-foreground">Quick Setup (2 minutes)</p>
                  <p className="text-xs text-muted-foreground">Connect your Telegram bot, add groups, and you&apos;re ready to go.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl bg-white/[0.03] p-3">
                <Kanban className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-foreground">3 Pipeline Boards</p>
                  <p className="text-xs text-muted-foreground">BD, Marketing, and Admin — each with 7-stage pipelines.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl bg-white/[0.03] p-3">
                <Bot className="h-4 w-4 text-purple-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-foreground">Telegram Bot Automation</p>
                  <p className="text-xs text-muted-foreground">Stage changes auto-notify linked groups. Daily digests, broadcasts, and more.</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <button
                onClick={dismissWelcome}
                className="rounded-xl border border-white/10 px-4 py-3 sm:py-2.5 min-h-[44px] text-sm text-muted-foreground hover:text-foreground active:bg-white/[0.06] motion-safe:transition-colors"
              >
                Skip
              </button>
              <Link
                href="/settings/integrations"
                onClick={dismissWelcome}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-3 sm:py-2.5 min-h-[44px] text-sm font-medium motion-safe:transition-colors hover:bg-primary/90 active:bg-primary/80"
              >
                Start Setup <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      )}

    <div className="rounded-2xl border border-primary/20 bg-primary/[0.03] overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-primary/10">
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-foreground truncate">Get Started with SupraTeam</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {completedCount}/{items.length} steps completed
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Progress bar */}
          <div className="w-16 sm:w-24 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary motion-safe:transition-all"
              style={{ width: `${(completedCount / items.length) * 100}%` }}
            />
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground motion-safe:transition-colors"
            aria-label="Dismiss setup checklist"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="divide-y divide-white/5">
        {items.map((item) => {
          const Icon = item.icon;
          const isLinkConversation = item.key === "link_conversation";
          const sharedClassName = cn(
            "flex items-center gap-3 px-4 py-3 min-h-[52px] motion-safe:transition-colors hover:bg-white/[0.03] active:bg-white/[0.06] w-full text-left",
            item.done && "opacity-60"
          );

          const content = (
            <>
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
            </>
          );

          if (isLinkConversation && !item.done && onLinkConversationClick) {
            return (
              <button
                key={item.key}
                onClick={onLinkConversationClick}
                className={sharedClassName}
              >
                {content}
              </button>
            );
          }

          return (
            <Link
              key={item.key}
              href={item.href}
              className={sharedClassName}
            >
              {content}
            </Link>
          );
        })}
      </div>
    </div>
    </>
  );
}
