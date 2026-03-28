"use client";

import * as React from "react";

// ── Step definitions ────────────────────────────────────────────

type BridgeTourStep = {
  title: string;
  description: string;
  target: string; // CSS selector or area name
  position: "top" | "bottom" | "left" | "right" | "center";
  action?: string; // what the user should do
  /** Optional icon rendered before the title */
  icon?: string;
};

const BRIDGE_TOUR_STEPS: BridgeTourStep[] = [
  {
    title: "The Improvement Loop",
    description:
      "This workflow closes the gap between your app and the competition. It takes your weakest scoring categories, generates AI improvement plans for each one, then has competitor CPOs review the plans and re-score you. One click, full cycle.",
    target: "center",
    position: "center",
    icon: "\u{1F504}",
  },
  {
    title: "Trigger: Start the Cycle",
    description:
      "Every run begins here. Right now it is set to manual, which means you press play when you are ready. Later you can switch it to 'schedule' or 'webhook' so it runs automatically after each sprint.",
    target: "bridge-trigger",
    position: "right",
    action: "Click the Trigger node to see its settings in the Inspector",
  },
  {
    title: "LLM Nodes: One Per Gap",
    description:
      "Each LLM node targets a single gap category (Core Features, UI/UX, Performance). The prompt asks Claude to generate a concrete improvement plan with expected score lift. You can add or remove these to match your actual gap report.",
    target: "bridge-llm-1",
    position: "right",
    action: "Click an LLM node and customize the system prompt for your app",
  },
  {
    title: "Merge: Combine All Plans",
    description:
      "The Merge node waits for every LLM branch to finish, then concatenates the plans into a single document. This is what gets handed to the CPO reviewers. No configuration needed unless you want to change the separator format.",
    target: "bridge-merge",
    position: "bottom",
    action: "Hover over the Merge node to see its input connections",
  },
  {
    title: "CPO Review: The Hard Conversation",
    description:
      "Competitor CPOs evaluate your improvement plan with the same critical eye they would use on their own product. They score feasibility, impact, and whether it actually closes the gap. This is where honest feedback happens.",
    target: "bridge-cpo",
    position: "left",
    action: "Click the CPO Review node to add your actual competitor personas",
  },
  {
    title: "Re-Score: Measure the Delta",
    description:
      "After CPO review, this node re-scores your app on the gap categories. You will see a before/after delta for each category. If the gap is still above 10, you know exactly where to focus the next round.",
    target: "bridge-rescore",
    position: "left",
    action: "Check the Re-Score node to verify your gap categories match",
  },
  {
    title: "Output: Your Improvement Report",
    description:
      "The final node produces a structured report with every improvement plan, CPO feedback, and updated scores. By default it logs to the execution panel. Switch it to 'file' to save reports to .athena/ in your repo.",
    target: "bridge-output",
    position: "left",
    action: "Set the output type to 'file' if you want persistent reports",
  },
  {
    title: "Run It",
    description:
      "Your Bridge workflow is ready. Hit 'Validate & Run' to execute the full loop. You will see each node light up as it processes, with streaming LLM output and token costs in real-time. After the run, check the delta. Repeat until gap < 10.",
    target: "run-button",
    position: "bottom",
    action: "Click 'Validate & Run' to start your first improvement cycle",
    icon: "\u{1F680}",
  },
];

// ── Hook: manage bridge tour state ──────────────────────────────

export function useBridgeTour(prefix = "athena") {
  const key = `${prefix}:bridge-tour-completed`;
  const [showBridgeTour, setShowBridgeTour] = React.useState(false);

  const startBridgeTour = React.useCallback(() => {
    setShowBridgeTour(true);
  }, []);

  const completeBridgeTour = React.useCallback(() => {
    localStorage.setItem(key, "completed");
    setShowBridgeTour(false);
  }, [key]);

  const skipBridgeTour = React.useCallback(() => {
    localStorage.setItem(key, "skipped");
    setShowBridgeTour(false);
  }, [key]);

  const resetBridgeTour = React.useCallback(() => {
    localStorage.removeItem(key);
  }, [key]);

  const hasSeen = React.useMemo(() => {
    if (typeof window === "undefined") return false;
    return !!localStorage.getItem(key);
  }, [key]);

  return {
    showBridgeTour,
    startBridgeTour,
    completeBridgeTour,
    skipBridgeTour,
    resetBridgeTour,
    hasSeen,
  };
}

// ── Component ───────────────────────────────────────────────────

type BridgeWalkthroughTourProps = {
  onComplete: () => void;
  onSkip: () => void;
};

export function BridgeWalkthroughTour({
  onComplete,
  onSkip,
}: BridgeWalkthroughTourProps) {
  const [step, setStep] = React.useState(0);
  const current = BRIDGE_TOUR_STEPS[step];
  const isFirst = step === 0;
  const isLast = step === BRIDGE_TOUR_STEPS.length - 1;

  // Position the card relative to the target node on the canvas
  const [positionStyles, setPositionStyles] = React.useState<React.CSSProperties>({
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
  });

  React.useEffect(() => {
    const styles: React.CSSProperties = {};

    if (current.position === "center" || current.target === "center") {
      styles.top = "50%";
      styles.left = "50%";
      styles.transform = "translate(-50%, -50%)";
      setPositionStyles(styles);
      return;
    }

    // Bridge-specific targets: look for nodes by their data-id on the React Flow canvas,
    // then fall back to data-tour attributes and generic selectors
    const selectorMap: Record<string, string> = {
      "bridge-trigger":
        "[data-id='bridge-trigger'], [data-tour='bridge-trigger']",
      "bridge-llm-1":
        "[data-id='bridge-llm-1'], [data-tour='bridge-llm-1']",
      "bridge-llm-2":
        "[data-id='bridge-llm-2'], [data-tour='bridge-llm-2']",
      "bridge-llm-3":
        "[data-id='bridge-llm-3'], [data-tour='bridge-llm-3']",
      "bridge-merge":
        "[data-id='bridge-merge'], [data-tour='bridge-merge']",
      "bridge-cpo":
        "[data-id='bridge-cpo'], [data-tour='bridge-cpo']",
      "bridge-rescore":
        "[data-id='bridge-rescore'], [data-tour='bridge-rescore']",
      "bridge-output":
        "[data-id='bridge-output'], [data-tour='bridge-output']",
      "run-button":
        "[data-tour='run'], button[aria-label*='Run'], button[aria-label*='Validate']",
    };

    const selector = selectorMap[current.target];
    const el = selector ? document.querySelector(selector) : null;

    if (el) {
      const rect = el.getBoundingClientRect();
      const pad = 16;

      if (current.position === "right") {
        styles.top = `${Math.max(80, rect.top)}px`;
        styles.left = `${rect.right + pad}px`;
      } else if (current.position === "left") {
        styles.top = `${Math.max(80, rect.top)}px`;
        styles.right = `${window.innerWidth - rect.left + pad}px`;
      } else if (current.position === "bottom") {
        styles.top = `${rect.bottom + 12}px`;
        styles.left = `${rect.left}px`;
      } else if (current.position === "top") {
        styles.bottom = `${window.innerHeight - rect.top + 12}px`;
        styles.left = `${rect.left}px`;
      }
    } else {
      // Fallback positions when nodes are not yet rendered
      styles.top = "50%";
      styles.left = "50%";
      styles.transform = "translate(-50%, -50%)";
    }

    setPositionStyles(styles);
  }, [step, current.target, current.position]);

  // Scroll the target node into view when advancing steps
  React.useEffect(() => {
    if (current.target === "center" || current.target === "run-button") return;

    const el = document.querySelector(
      `[data-id='${current.target}']`
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }
  }, [step, current.target]);

  return (
    <div className="absolute inset-0 z-50 pointer-events-none">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 pointer-events-auto"
        onClick={onSkip}
      />

      {/* Tour card */}
      <div
        className="absolute z-50 w-80 pointer-events-auto"
        style={positionStyles}
      >
        <div className="rounded-xl border border-primary/30 bg-neutral-900/98 p-5 shadow-2xl backdrop-blur-md">
          {/* Progress dots */}
          <div className="flex items-center gap-1.5 mb-3">
            {BRIDGE_TOUR_STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step
                    ? "w-6 bg-primary"
                    : i < step
                      ? "w-1.5 bg-primary/40"
                      : "w-1.5 bg-white/10"
                }`}
              />
            ))}
          </div>

          {/* Title with optional icon */}
          <h3 className="text-sm font-semibold text-foreground mb-2">
            {current.icon && (
              <span className="mr-1.5">{current.icon}</span>
            )}
            {current.title}
          </h3>

          <p className="text-xs text-muted-foreground leading-relaxed mb-3">
            {current.description}
          </p>

          {/* Action hint */}
          {current.action && (
            <div className="flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 mb-4">
              <span className="text-primary text-xs shrink-0">{"\u2192"}</span>
              <span className="text-xs text-primary/80">
                {current.action}
              </span>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={onSkip}
              className="text-xs text-muted-foreground hover:text-foreground transition"
            >
              Skip tour
            </button>
            <div className="flex items-center gap-2">
              {!isFirst && (
                <button
                  onClick={() => setStep((s) => s - 1)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-white/10 transition"
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
                className="rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition"
              >
                {isLast ? "Start Improving" : "Next"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
