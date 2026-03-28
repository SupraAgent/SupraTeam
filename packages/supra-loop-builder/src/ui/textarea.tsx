import * as React from "react";
import { cn } from "../lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "min-h-[120px] w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur outline-none transition hover:border-white/15 focus:border-primary/40 focus:bg-white/[0.06] focus:ring-2 focus:ring-primary/15",
          className
        )}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";
