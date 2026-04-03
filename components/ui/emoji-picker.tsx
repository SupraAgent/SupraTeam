"use client";

import * as React from "react";
import { Smile } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Emoji Data (compact — covers the most-used categories) ──────

interface EmojiCategory {
  name: string;
  icon: string;
  emojis: string[];
}

/** Keyword index: maps search terms to emoji characters for real search. */
const EMOJI_KEYWORDS: Record<string, string[]> = {
  smile: ["😀","😃","😄","😁","😊","🙂"], laugh: ["😆","😅","🤣","😂"],
  love: ["🥰","😍","❤️","💕","💖","💗","💘"], heart: ["❤️","🧡","💛","💚","💙","💜","🖤","💔","❤️‍🔥"],
  fire: ["🔥","❤️‍🔥"], angry: ["😤","😡","😠","🤬"], sad: ["😢","😭","😞","😔","😥"],
  cry: ["😢","😭"], think: ["🤔","🧐"], cool: ["😎","🤓"], wink: ["😉","😜"],
  thumbs: ["👍","👎"], ok: ["👌","✅"], clap: ["👏"], pray: ["🙏"],
  wave: ["👋"], point: ["👈","👉","👆","👇","☝️","🫵"],
  star: ["⭐","🌟","💫","✨"], check: ["✅","✔️","☑️"], cross: ["❌","✖️"],
  warning: ["⚠️","❗","❓"], money: ["💰","💸","💵","💴","💶","💷","🤑"],
  rocket: ["🚀"], trophy: ["🏆","🥇","🥈","🥉","🏅"],
  party: ["🎉","🎊","🥳"], celebrate: ["🎉","🎊","🥳","🏆"],
  phone: ["📱","📞"], computer: ["💻","🖥️","⌨️"], email: ["📧","📩","📨"],
  lock: ["🔒","🔓","🔑"], shield: ["🛡️"], gear: ["⚙️"],
  music: ["🎵","🎶","🎤","🎧","🎸","🎹"], camera: ["📷","📸"],
  sun: ["☀️","🌞","🌅"], moon: ["🌙","🌛","🌜"], rain: ["🌧️","☔"],
  food: ["🍕","🍔","🍟","🌮","🍣","🍩"], drink: ["☕","🍵","🍺","🍷","🥤"],
  dog: ["🐶","🐕"], cat: ["🐱","🐈"], skull: ["💀","☠️"], ghost: ["👻"],
  hundred: ["💯"], poop: ["💩"], clown: ["🤡"], devil: ["😈","👿"],
  eyes: ["👀","👁️"], brain: ["🧠"], muscle: ["💪"],
  handshake: ["🤝"], fist: ["✊","👊","🤛","🤜"],
  pin: ["📌"], link: ["🔗"], bulb: ["💡"], key: ["🔑"],
  chart: ["📊","📈","📉"], calendar: ["🗓️","📅"],
  bell: ["🔔","🔕"], megaphone: ["📣","📢"],
  speech: ["💬","💭","🗨️"], writing: ["✍️","📝"],
};

const CATEGORIES: EmojiCategory[] = [
  {
    name: "Smileys",
    icon: "😀",
    emojis: [
      "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","😊",
      "😇","🥰","😍","🤩","😘","😗","😚","😙","🥲","😋",
      "😛","😜","🤪","😝","🤑","🤗","🤭","🫢","🤫","🤔",
      "🫡","🤐","🤨","😐","😑","😶","🫥","😏","😒","🙄",
      "😬","🤥","😌","😔","😪","🤤","😴","😷","🤒","🤕",
      "🤢","🤮","🥵","🥶","🥴","😵","🤯","🤠","🥳","🥸",
      "😎","🤓","🧐","😕","🫤","😟","🙁","😮","😯","😲",
      "😳","🥺","🥹","😦","😧","😨","😰","😥","😢","😭",
      "😱","😖","😣","😞","😓","😩","😫","🥱","😤","😡",
      "😠","🤬","😈","👿","💀","☠️","💩","🤡","👹","👺",
    ],
  },
  {
    name: "Gestures",
    icon: "👋",
    emojis: [
      "👋","🤚","🖐️","✋","🖖","🫱","🫲","🫳","🫴","👌",
      "🤌","🤏","✌️","🤞","🫰","🤟","🤘","🤙","👈","👉",
      "👆","🖕","👇","☝️","🫵","👍","👎","✊","👊","🤛",
      "🤜","👏","🙌","🫶","👐","🤲","🤝","🙏","✍️","💪",
      "🦾","🦿","🦵","🦶","👂","🦻","👃","🧠","🫀","🫁",
    ],
  },
  {
    name: "Hearts",
    icon: "❤️",
    emojis: [
      "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔",
      "❤️‍🔥","❤️‍🩹","❣️","💕","💞","💓","💗","💖","💘","💝",
      "💟","♥️","🫶","💑","💏","👪","👨‍👩‍👦","👨‍👩‍👧",
    ],
  },
  {
    name: "Objects",
    icon: "🔥",
    emojis: [
      "🔥","💯","✨","⭐","🌟","💫","🎉","🎊","🏆","🥇",
      "🥈","🥉","🏅","🎖️","📣","📢","🔔","🔕","💰","💸",
      "💵","💴","💶","💷","📱","💻","🖥️","⌨️","📧","📩",
      "📝","📄","📊","📈","📉","🗓️","⏰","⏳","🔑","🔒",
      "🔓","🛡️","⚙️","🔧","🔨","💡","📌","📎","🔗","📋",
      "✅","❌","⚠️","❓","❗","💬","💭","🗨️","👁️‍🗨️",
    ],
  },
  {
    name: "Flags",
    icon: "🚀",
    emojis: [
      "🚀","🛸","✈️","🚗","🚕","🏠","🏢","🏦","🏥","🏫",
      "⛳","🎯","🎮","🎲","🧩","🎭","🎨","🎵","🎶","🎤",
      "🎧","📻","🎸","🎹","🎺","🥁","🎬","📺","📷","📸",
    ],
  },
];

const FREQUENTLY_USED_KEY = "suprateam-emoji-freq";

function getFrequentlyUsed(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(FREQUENTLY_USED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function trackEmoji(emoji: string) {
  try {
    const freq = getFrequentlyUsed();
    const updated = [emoji, ...freq.filter((e) => e !== emoji)].slice(0, 24);
    localStorage.setItem(FREQUENTLY_USED_KEY, JSON.stringify(updated));
  } catch {
    // localStorage unavailable
  }
}

// ── Component ─────────────────────────────────────────────────

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  className?: string;
}

export function EmojiPicker({ onSelect, className }: EmojiPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [activeCategory, setActiveCategory] = React.useState(0);
  const [frequent, setFrequent] = React.useState<string[]>([]);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  // Load frequently used on mount
  React.useEffect(() => {
    if (open) setFrequent(getFrequentlyUsed());
  }, [open]);

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  React.useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  function handleSelect(emoji: string) {
    trackEmoji(emoji);
    onSelect(emoji);
    // Don't close — allow multiple emoji selections
  }

  // Filtered emojis for search — uses keyword index for real search
  const searchResults = React.useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    const seen = new Set<string>();
    const results: string[] = [];

    // Search keyword index first
    for (const [keyword, emojis] of Object.entries(EMOJI_KEYWORDS)) {
      if (keyword.includes(q) || q.includes(keyword)) {
        for (const e of emojis) {
          if (!seen.has(e)) { seen.add(e); results.push(e); }
        }
      }
    }

    // Fallback: also search category names
    for (const cat of CATEGORIES) {
      if (cat.name.toLowerCase().includes(q)) {
        for (const e of cat.emojis) {
          if (!seen.has(e)) { seen.add(e); results.push(e); }
        }
      }
    }

    return results.slice(0, 80);
  }, [search]);

  const displayCategory = searchResults
    ? { name: `Results for "${search}"`, emojis: searchResults }
    : CATEGORIES[activeCategory];

  return (
    <div className={cn("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex h-[38px] w-[38px] items-center justify-center rounded-lg border border-white/10 transition-colors",
          open
            ? "bg-white/10 text-foreground"
            : "bg-white/5 text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
        )}
        title="Emoji"
      >
        <Smile className="h-4 w-4" />
      </button>

      {open && (
        <div
          ref={containerRef}
          className="absolute bottom-full mb-2 right-0 w-[320px] rounded-xl border border-white/10 bg-card shadow-2xl shadow-black/40 overflow-hidden z-50"
        >
          {/* Search */}
          <div className="p-2 border-b border-white/[0.06]">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search emojis..."
              className="w-full rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50"
              autoFocus
            />
          </div>

          {/* Category tabs */}
          {!search && (
            <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-white/[0.06] overflow-x-auto">
              {frequent.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveCategory(-1)}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md text-sm transition-colors shrink-0",
                    activeCategory === -1
                      ? "bg-white/10"
                      : "hover:bg-white/[0.06]"
                  )}
                  title="Frequently Used"
                >
                  🕐
                </button>
              )}
              {CATEGORIES.map((cat, i) => (
                <button
                  key={cat.name}
                  type="button"
                  onClick={() => setActiveCategory(i)}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md text-sm transition-colors shrink-0",
                    activeCategory === i
                      ? "bg-white/10"
                      : "hover:bg-white/[0.06]"
                  )}
                  title={cat.name}
                >
                  {cat.icon}
                </button>
              ))}
            </div>
          )}

          {/* Emoji grid */}
          <div className="p-2 h-[200px] overflow-y-auto">
            {/* Frequently used section */}
            {!search && activeCategory === -1 && frequent.length > 0 && (
              <>
                <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium px-1 mb-1.5">
                  Frequently Used
                </p>
                <div className="grid grid-cols-8 gap-0.5">
                  {frequent.map((emoji, i) => (
                    <button
                      key={`freq-${emoji}`}
                      type="button"
                      onClick={() => handleSelect(emoji)}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-lg hover:bg-white/10 transition-colors"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Main category or search results */}
            {displayCategory && (
              <>
                {!search && activeCategory !== -1 && (
                  <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium px-1 mb-1.5">
                    {displayCategory.name}
                  </p>
                )}
                {search && searchResults && searchResults.length === 0 && (
                  <p className="text-xs text-muted-foreground/40 text-center py-8">
                    No emojis found
                  </p>
                )}
                <div className="grid grid-cols-8 gap-0.5">
                  {displayCategory.emojis.map((emoji, i) => (
                    <button
                      key={`${emoji}-${i}`}
                      type="button"
                      onClick={() => handleSelect(emoji)}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-lg hover:bg-white/10 transition-colors"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
