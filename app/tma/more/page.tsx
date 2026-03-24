"use client";

import * as React from "react";
import Link from "next/link";
import { Users, Radio, Settings, ChevronRight } from "lucide-react";
import { BottomTabBar } from "@/components/tma/bottom-tab-bar";

const ITEMS = [
  { href: "/tma/contacts", label: "Contacts", description: "View and manage CRM contacts", icon: Users },
  { href: "/tma/broadcasts", label: "Broadcasts", description: "Send messages to TG groups", icon: Radio },
  { href: "/settings", label: "Settings", description: "App configuration", icon: Settings },
];

export default function TMAMorePage() {
  React.useEffect(() => {
    if (typeof window !== "undefined" && (window as unknown as Record<string, unknown>).Telegram) {
      const tg = (window as unknown as { Telegram: { WebApp: { ready: () => void; expand: () => void } } }).Telegram.WebApp;
      tg.ready();
      tg.expand();
    }
  }, []);

  return (
    <div className="pb-20">
      <div className="px-4 pt-4 pb-3">
        <h1 className="text-lg font-semibold text-foreground">More</h1>
      </div>

      <div className="px-4 space-y-1.5">
        {ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 transition active:bg-white/[0.06]"
          >
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <item.icon className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{item.label}</p>
              <p className="text-[10px] text-muted-foreground">{item.description}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/30 shrink-0" />
          </Link>
        ))}
      </div>

      <BottomTabBar active="more" />
    </div>
  );
}
