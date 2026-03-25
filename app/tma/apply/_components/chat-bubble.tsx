"use client";

import { cn } from "@/lib/utils";

type ChatBubbleProps = {
  role: "bot" | "user";
  children: React.ReactNode;
  animate?: boolean;
};

export function ChatBubble({ role, children, animate = true }: ChatBubbleProps) {
  const isBot = role === "bot";

  return (
    <div
      className={cn(
        "flex w-full",
        isBot ? "justify-start" : "justify-end",
        animate && "animate-slide-up"
      )}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isBot
            ? "bg-white/8 text-white/90 rounded-bl-md"
            : "bg-[hsl(var(--primary))] text-white rounded-br-md"
        )}
      >
        {children}
      </div>
    </div>
  );
}
