import * as React from "react";
import { cn } from "../lib/utils";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "secondary" | "ghost" | "outline";
  size?: "default" | "sm" | "lg" | "icon";
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const variantClasses =
      variant === "secondary"
        ? "border border-white/10 bg-white/5 text-foreground hover:bg-white/10 hover:border-white/15"
        : variant === "ghost"
          ? "border border-transparent bg-transparent text-foreground hover:border-white/10 hover:bg-white/5"
          : variant === "outline"
            ? "border border-white/20 bg-white/5 text-foreground hover:bg-white/10 hover:border-white/25"
            : "bg-primary text-primary-foreground hover:brightness-110 shadow-[0_0_0_1px_rgba(12,206,107,0.2),0_4px_12px_rgba(12,206,107,0.15)]";

    const sizeClasses =
      size === "sm"
        ? "h-9 px-3 text-sm"
        : size === "lg"
          ? "h-12 px-5 text-base"
          : size === "icon"
            ? "h-9 w-9 p-0"
            : "h-10 px-4 text-sm";

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-all duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
          sizeClasses,
          variantClasses,
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
