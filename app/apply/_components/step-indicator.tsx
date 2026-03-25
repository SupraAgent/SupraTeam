"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepIndicatorProps {
  sections: { id: string; title: string }[];
  activeIndex: number;
}

export function StepIndicator({ sections, activeIndex }: StepIndicatorProps) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        {sections.map((section, i) => {
          const isCompleted = i < activeIndex;
          const isActive = i === activeIndex;

          return (
            <div key={section.id} className="flex flex-1 items-center">
              {/* Step circle */}
              <div className="relative flex flex-col items-center">
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all duration-300",
                    isCompleted &&
                      "border-primary bg-primary text-primary-foreground",
                    isActive &&
                      "border-primary bg-transparent text-primary",
                    !isCompleted &&
                      !isActive &&
                      "border-white/20 bg-transparent text-white/40"
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span>{i + 1}</span>
                  )}

                  {/* Pulse ring for active step */}
                  {isActive && (
                    <span className="absolute inset-0 animate-ping rounded-full border-2 border-primary opacity-20" />
                  )}
                </div>

                {/* Title below circle - hidden on mobile */}
                <span
                  className={cn(
                    "absolute top-11 hidden whitespace-nowrap text-xs font-medium transition-colors duration-300 sm:block",
                    isCompleted && "text-primary",
                    isActive && "text-foreground",
                    !isCompleted && !isActive && "text-white/40"
                  )}
                >
                  {section.title}
                </span>
              </div>

              {/* Connecting line */}
              {i < sections.length - 1 && (
                <div className="relative mx-2 h-0.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-500 ease-out",
                      isCompleted ? "w-full" : "w-0"
                    )}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
