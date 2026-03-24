"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Zap, CheckSquare, MessageSquare, MoreHorizontal } from "lucide-react";

type Tab = "home" | "pipeline" | "tasks" | "chat" | "more";

const TABS: { key: Tab; label: string; href: string; icon: React.ReactNode }[] = [
  {
    key: "home",
    label: "Home",
    href: "/tma",
    icon: <Zap className="h-5 w-5" />,
  },
  {
    key: "pipeline",
    label: "Pipeline",
    href: "/tma/deals",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <rect x="3" y="3" width="5" height="18" rx="1" />
        <rect x="10" y="3" width="5" height="12" rx="1" />
        <rect x="17" y="3" width="5" height="15" rx="1" />
      </svg>
    ),
  },
  {
    key: "tasks",
    label: "Tasks",
    href: "/tma/tasks",
    icon: <CheckSquare className="h-5 w-5" />,
  },
  {
    key: "chat",
    label: "Chat",
    href: "/tma/ai-chat",
    icon: <MessageSquare className="h-5 w-5" />,
  },
  {
    key: "more",
    label: "More",
    href: "/tma/more",
    icon: <MoreHorizontal className="h-5 w-5" />,
  },
];

export function BottomTabBar({ active }: { active: Tab }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 border-t border-white/10 bg-[hsl(225,35%,5%)] flex items-center justify-around py-2 px-2 safe-area-bottom z-50">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={cn(
            "flex flex-col items-center gap-0.5 min-w-[48px] transition-colors",
            active === tab.key ? "text-primary" : "text-muted-foreground"
          )}
        >
          {tab.icon}
          <span className="text-[10px]">{tab.label}</span>
        </Link>
      ))}
    </div>
  );
}
