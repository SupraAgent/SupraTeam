"use client";

import * as React from "react";

// ── Types ──────────────────────────────────────────────────────

export interface TourStepDef {
  title: string;
  description: string;
  target: string;
  position: "top" | "bottom" | "left" | "right" | "center";
  action?: string;
  icon?: string;
}

interface TourCardProps {
  steps: TourStepDef[];
  selectorMap: Record<string, string>;
  onComplete: () => void;
  onSkip: () => void;
  lastButtonLabel?: string;
  /** Whether to scroll target elements into view on step change */
  scrollToTarget?: boolean;
}

// ── Shared positioning logic ───────────────────────────────────

function computePosition(
  step: TourStepDef,
  selectorMap: Record<string, string>,
  fallbackMap?: Record<string, React.CSSProperties>,
): React.CSSProperties {
  const isMobile = window.innerWidth < 640;
  const cardWidth = isMobile ? window.innerWidth - 32 : 320;
  const pad = 16;
  const safeBottom = `calc(${pad}px + env(safe-area-inset-bottom, 0px))`;

  // Center or mobile: anchor card to bottom with safe area
  if (step.position === "center" || step.target === "center" || isMobile) {
    if (isMobile) {
      return { bottom: safeBottom, left: `${pad}px`, right: `${pad}px` };
    }
    return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
  }

  // Desktop: position relative to target element
  const selector = selectorMap[step.target];
  const el = selector ? document.querySelector(selector) : null;

  if (el) {
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    switch (step.position) {
      case "right":
        return {
          top: `${Math.min(Math.max(pad, rect.top + 20), vh - 300)}px`,
          left: `${Math.min(rect.right + pad, vw - cardWidth - pad)}px`,
        };
      case "left":
        return {
          top: `${Math.min(Math.max(pad, rect.top + 20), vh - 300)}px`,
          right: `${Math.max(pad, vw - rect.left + pad)}px`,
        };
      case "bottom":
        return {
          top: `${Math.min(rect.bottom + 12, vh - 300)}px`,
          left: `${Math.min(rect.left, vw - cardWidth - pad)}px`,
        };
      case "top":
        return {
          bottom: `${Math.max(pad, vh - rect.top + 12)}px`,
          left: `${Math.min(rect.left, vw - cardWidth - pad)}px`,
        };
    }
  }

  // Desktop fallback
  if (fallbackMap?.[step.target]) {
    return fallbackMap[step.target];
  }
  return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
}

// ── Component ──────────────────────────────────────────────────

export function TourCard({
  steps,
  selectorMap,
  onComplete,
  onSkip,
  lastButtonLabel = "Get Started",
  scrollToTarget = false,
}: TourCardProps) {
  const [step, setStep] = React.useState(0);
  const current = steps[step];
  const isFirst = step === 0;
  const isLast = step === steps.length - 1;
  const cardRef = React.useRef<HTMLDivElement>(null);

  const [positionStyles, setPositionStyles] = React.useState<React.CSSProperties>({
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
  });

  // Recalculate on step change AND on resize/orientation change
  React.useEffect(() => {
    function recalc() {
      setPositionStyles(computePosition(current, selectorMap));
    }
    recalc();

    window.addEventListener("resize", recalc);
    window.visualViewport?.addEventListener("resize", recalc);
    return () => {
      window.removeEventListener("resize", recalc);
      window.visualViewport?.removeEventListener("resize", recalc);
    };
  }, [step, current, selectorMap]);

  // Scroll target into view
  React.useEffect(() => {
    if (!scrollToTarget) return;
    if (current.target === "center" || current.target === "run-button") return;
    const el = document.querySelector(`[data-id='${current.target}']`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }
  }, [step, current.target, scrollToTarget]);

  // Escape key to dismiss
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onSkip();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSkip]);

  // Focus trap: move focus into card on mount
  React.useEffect(() => {
    const firstBtn = cardRef.current?.querySelector("button");
    firstBtn?.focus();
  }, [step]);

  return (
    <div
      className="absolute inset-0 z-50 pointer-events-none"
      role="dialog"
      aria-modal="true"
      aria-label="Tour walkthrough"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 pointer-events-auto"
        onClick={onSkip}
      />

      {/* Tour card */}
      <div
        ref={cardRef}
        className="absolute z-50 w-[calc(100vw-2rem)] sm:w-80 max-w-sm pointer-events-auto"
        style={positionStyles}
      >
        <div className="rounded-xl border border-primary/30 bg-neutral-900/[0.98] p-4 sm:p-5 shadow-2xl sm:backdrop-blur-md">
          {/* Progress dots */}
          <div className="flex items-center gap-1.5 mb-3">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full motion-safe:transition-all ${
                  i === step
                    ? "w-6 bg-primary"
                    : i < step
                      ? "w-1.5 bg-primary/40"
                      : "w-1.5 bg-white/10"
                }`}
              />
            ))}
          </div>

          {/* Title */}
          <h3 className="text-sm sm:text-sm font-semibold text-foreground mb-2">
            {current.icon && (
              <span className="mr-1.5">{current.icon}</span>
            )}
            {current.title}
          </h3>

          {/* Description */}
          <p className="text-sm sm:text-xs text-muted-foreground leading-relaxed mb-3">
            {current.description}
          </p>

          {/* Action hint */}
          {current.action && (
            <div className="flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 mb-4">
              <span className="text-primary text-sm sm:text-xs shrink-0">{"\u2192"}</span>
              <span className="text-sm sm:text-xs text-primary/80">{current.action}</span>
            </div>
          )}

          {/* Navigation — 44px min touch targets */}
          <div className="flex items-center justify-between">
            <button
              onClick={onSkip}
              className="text-sm sm:text-xs text-muted-foreground hover:text-foreground motion-safe:transition-colors min-h-[44px] px-2 -ml-2"
            >
              Skip tour
            </button>
            <div className="flex items-center gap-2">
              {!isFirst && (
                <button
                  onClick={() => setStep((s) => s - 1)}
                  className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 min-h-[44px] text-sm sm:text-xs font-medium text-foreground hover:bg-white/10 active:bg-white/15 motion-safe:transition-colors"
                >
                  Back
                </button>
              )}
              <button
                onClick={() => {
                  if (isLast) {
                    onComplete();
                  } else {
                    setStep((s) => s + 1);
                  }
                }}
                className="rounded-lg bg-primary px-5 py-2.5 min-h-[44px] text-sm sm:text-xs font-medium text-primary-foreground hover:opacity-90 active:opacity-80 motion-safe:transition-opacity"
              >
                {isLast ? lastButtonLabel : "Next"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
