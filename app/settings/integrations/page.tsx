"use client";

import * as React from "react";
import Link from "next/link";
import {
  MessageCircle,
  Hash,
  Mail,
  Webhook,
  Link2,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

type IntegrationStatus = {
  key: string;
  label: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  iconBg: string;
  connected: boolean | null; // null = loading
  detail?: string;
};

export default function IntegrationsOverviewPage() {
  const [integrations, setIntegrations] = React.useState<IntegrationStatus[]>([
    {
      key: "telegram",
      label: "Telegram Bots",
      description: "Register bots, manage groups, and send automated messages",
      href: "/settings/integrations/telegram",
      icon: <MessageCircle className="h-5 w-5 text-[#2AABEE]" />,
      iconBg: "bg-[#2AABEE]/10",
      connected: null,
    },
    {
      key: "tg-connect",
      label: "TG Connect",
      description: "Link your personal Telegram account for direct messaging",
      href: "/settings/integrations/connect",
      icon: <Link2 className="h-5 w-5 text-[#2AABEE]" />,
      iconBg: "bg-[#2AABEE]/10",
      connected: null,
    },
    {
      key: "slack",
      label: "Slack",
      description: "Send messages to Slack channels from workflow automations",
      href: "/settings/integrations/telegram#slack",
      icon: <Hash className="h-5 w-5 text-[#E01E5A]" />,
      iconBg: "bg-[#4A154B]/20",
      connected: null,
    },
    {
      key: "email",
      label: "Email (Gmail)",
      description: "Send emails and track opens from deal pipelines",
      href: "/settings/integrations/email",
      icon: <Mail className="h-5 w-5 text-[#EA4335]" />,
      iconBg: "bg-[#EA4335]/10",
      connected: null,
    },
    {
      key: "webhooks",
      label: "Webhooks",
      description: "Receive and send webhook events for external integrations",
      href: "/settings/integrations/webhooks",
      icon: <Webhook className="h-5 w-5 text-violet-400" />,
      iconBg: "bg-violet-500/10",
      connected: null,
    },
  ]);

  React.useEffect(() => {
    // Check Telegram bots
    fetch("/api/bots")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then(({ data }) => {
        const count = data?.length ?? 0;
        updateStatus("telegram", count > 0, `${count} bot${count !== 1 ? "s" : ""} registered`);
      })
      .catch(() => updateStatus("telegram", false));

    // Check Slack
    fetch("/api/slack")
      .then((r) => (r.ok ? r.json() : { connected: false }))
      .then((data) => {
        updateStatus("slack", data.connected, data.team ? `Workspace: ${data.team}` : undefined);
      })
      .catch(() => updateStatus("slack", false));

    // Check Email
    fetch("/api/tokens?provider=gmail")
      .then((r) => (r.ok ? r.json() : { data: null }))
      .then(({ data }) => {
        updateStatus("email", !!data, data ? "Gmail connected" : undefined);
      })
      .catch(() => updateStatus("email", false));

    // TG Connect + Webhooks — mark as configured (no API check needed)
    updateStatus("tg-connect", false);
    updateStatus("webhooks", false);
  }, []);

  function updateStatus(key: string, connected: boolean, detail?: string) {
    setIntegrations((prev) =>
      prev.map((i) => (i.key === key ? { ...i, connected, detail } : i))
    );
  }

  const connectedCount = integrations.filter((i) => i.connected === true).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Integrations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect external services to power automations, messaging, and outreach.
          <span className="ml-2 text-foreground font-medium">{connectedCount} connected</span>
        </p>
      </div>

      <div className="space-y-2">
        {integrations.map((integration) => (
          <Link
            key={integration.key}
            href={integration.href}
            className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition-colors hover:bg-white/[0.06] hover:border-white/15"
          >
            <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl shrink-0", integration.iconBg)}>
              {integration.icon}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">{integration.label}</p>
                {integration.connected === true && (
                  <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                    Connected
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {integration.detail ?? integration.description}
              </p>
            </div>

            <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-muted-foreground shrink-0 transition-colors" />
          </Link>
        ))}
      </div>
    </div>
  );
}
