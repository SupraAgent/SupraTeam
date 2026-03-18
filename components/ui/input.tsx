import * as React from "react";

import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          "h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-foreground placeholder:text-muted-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur outline-none transition hover:border-white/15 focus:border-primary/40 focus:bg-white/[0.06] focus:ring-2 focus:ring-primary/15",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
