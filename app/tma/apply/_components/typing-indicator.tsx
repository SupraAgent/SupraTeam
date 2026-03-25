"use client";

export function TypingIndicator() {
  return (
    <div className="flex justify-start animate-slide-up">
      <div className="bg-white/8 rounded-2xl rounded-bl-md px-4 py-3 flex gap-1.5 items-center">
        <span className="w-2 h-2 rounded-full bg-white/40 animate-bounce [animation-delay:0ms]" />
        <span className="w-2 h-2 rounded-full bg-white/40 animate-bounce [animation-delay:150ms]" />
        <span className="w-2 h-2 rounded-full bg-white/40 animate-bounce [animation-delay:300ms]" />
      </div>
    </div>
  );
}
