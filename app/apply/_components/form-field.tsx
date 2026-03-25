"use client";

import { cn } from "@/lib/utils";

interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  helperText?: string;
  children: React.ReactNode;
}

export function FormField({
  label,
  required,
  error,
  helperText,
  children,
}: FormFieldProps) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        {label}
        {required && (
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
        )}
      </label>

      {children}

      {error && (
        <p className="text-xs text-red-400 transition-opacity duration-200">
          {error}
        </p>
      )}

      {!error && helperText && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
}
