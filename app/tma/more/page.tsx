"use client";

import * as React from "react";
import Link from "next/link";
import { Users, Radio, Settings, ChevronRight, Bell } from "lucide-react";
import { BottomTabBar } from "@/components/tma/bottom-tab-bar";
import { hapticImpact } from "@/components/tma/haptic";
import { useTelegramWebApp } from "@/components/tma/use-telegram";

const ITEMS = [
  { href: "/tma/contacts", label: "Contacts", description: "View and manage CRM contacts", icon: Users },
  { href: "/tma/broadcasts", label: "Broadcasts", description: "Send messages to TG groups", icon: Radio },
  { href: "/tma/more", label: "Settings", description: "Notification preferences below", icon: Settings },
];

interface PushPrefs {
  push_enabled: boolean;
  push_stage_changes: boolean;
  push_tg_messages: boolean;
  push_escalations: boolean;
  push_outreach_replies: boolean;
}

const DEFAULT_PREFS: PushPrefs = {
  push_enabled: true,
  push_stage_changes: true,
  push_tg_messages: true,
  push_escalations: true,
  push_outreach_replies: true,
};

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (val: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => { hapticImpact("light"); onChange(!checked); }}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${checked ? "bg-primary" : "bg-white/10"}`}
    >
      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${checked ? "translate-x-[18px]" : "translate-x-[3px]"}`} />
    </button>
  );
}

export default function TMAMorePage() {
  const [prefs, setPrefs] = React.useState<PushPrefs>(DEFAULT_PREFS);
  const [prefsLoaded, setPrefsLoaded] = React.useState(false);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPrefs = React.useRef<PushPrefs | null>(null);

  useTelegramWebApp();

  React.useEffect(() => {
    // Load notification preferences
    fetch("/api/notification-preferences")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.preferences) {
          setPrefs({
            push_enabled: data.preferences.push_enabled ?? true,
            push_stage_changes: data.preferences.push_stage_changes ?? true,
            push_tg_messages: data.preferences.push_tg_messages ?? true,
            push_escalations: data.preferences.push_escalations ?? true,
            push_outreach_replies: data.preferences.push_outreach_replies ?? true,
          });
        }
        setPrefsLoaded(true);
      })
      .catch(() => setPrefsLoaded(true));
  }, []);

  // Flush pending save to server
  const flushSave = React.useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    if (pendingPrefs.current) {
      fetch("/api/notification-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pendingPrefs.current),
      }).catch((err) => console.error("[tma/more] save prefs error:", err));
      pendingPrefs.current = null;
    }
  }, []);

  // Debounced save
  const updatePref = React.useCallback((key: keyof PushPrefs, value: boolean) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      pendingPrefs.current = next;

      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(flushSave, 500);

      return next;
    });
  }, [flushSave]);

  // Flush on unmount (don't lose the last toggle)
  React.useEffect(() => {
    return () => flushSave();
  }, [flushSave]);

  const PUSH_ITEMS: { key: keyof PushPrefs; label: string; description: string }[] = [
    { key: "push_stage_changes", label: "Stage Changes", description: "When a deal moves stages" },
    { key: "push_tg_messages", label: "TG Messages", description: "New messages in deal groups" },
    { key: "push_escalations", label: "Escalations", description: "AI agent escalation alerts" },
    { key: "push_outreach_replies", label: "Outreach Replies", description: "Replies to outreach sequences" },
  ];

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

      {/* Push Notification Preferences */}
      {prefsLoaded && (
        <div className="px-4 mt-6">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Push Notifications</p>
          </div>

          <div className="rounded-xl border border-white/10 overflow-hidden">
            {/* Master toggle */}
            <div className="flex items-center justify-between px-4 py-3 bg-white/[0.035]">
              <div>
                <p className="text-sm font-medium text-foreground">Enable Push</p>
                <p className="text-[10px] text-muted-foreground">Receive DMs from the bot</p>
              </div>
              <ToggleSwitch checked={prefs.push_enabled} onChange={(v) => updatePref("push_enabled", v)} />
            </div>

            {/* Per-type toggles (only shown when master is on) */}
            {prefs.push_enabled && PUSH_ITEMS.map((item) => (
              <div key={item.key} className="flex items-center justify-between px-4 py-2.5 border-t border-white/5">
                <div>
                  <p className="text-xs text-foreground">{item.label}</p>
                  <p className="text-[10px] text-muted-foreground/60">{item.description}</p>
                </div>
                <ToggleSwitch checked={prefs[item.key]} onChange={(v) => updatePref(item.key, v)} />
              </div>
            ))}
          </div>
        </div>
      )}

      <BottomTabBar active="more" />
    </div>
  );
}
