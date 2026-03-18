import * as React from "react";
import { cn } from "@/lib/utils";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  options: { value: string; label: string }[];
  placeholder?: string;
};

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, options, placeholder, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn(
          "h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur outline-none transition hover:border-white/15 focus:border-primary/40 focus:bg-white/[0.06] focus:ring-2 focus:ring-primary/15 appearance-none",
          className
        )}
        {...props}
      >
        {placeholder && (
          <option value="" className="bg-[hsl(225,35%,6%)]">
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-[hsl(225,35%,6%)]">
            {opt.label}
          </option>
        ))}
      </select>
    );
  }
);
Select.displayName = "Select";
