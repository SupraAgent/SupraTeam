"use client";

import * as React from "react";

type TourStep = {
  title: string;
  description: string;
  target: string; // CSS selector or area name
  position: "top" | "bottom" | "left" | "right" | "center";
  action?: string; // what the user should do
};

const TOUR_STEPS: TourStep[] = [
  {
    title: "Welcome to Workflow Builder",
    description: "Build AI-powered automations by connecting visual nodes. Let's walk through the basics.",
    target: "center",
    position: "center",
  },
  {
    title: "1. Drag Nodes from the Palette",
    description: "The Node Palette on the left has two groups: Core nodes (personas, apps) and Workflow nodes (triggers, LLMs, transforms). Drag any node onto the canvas to add it.",
    target: "palette",
    position: "right",
    action: "Try dragging a Trigger node onto the canvas",
  },
  {
    title: "2. Connect Nodes Together",
    description: "Each node has connection handles (small circles). Drag from one handle to another to create a connection. Data flows along these connections during execution.",
    target: "canvas",
    position: "center",
    action: "Connect your Trigger to another node",
  },
  {
    title: "3. Configure in the Inspector",
    description: "Click any node to open the Inspector panel on the right. Here you can set properties like LLM prompts, condition expressions, or trigger types.",
    target: "inspector",
    position: "left",
    action: "Click a node to see its properties",
  },
  {
    title: "4. Use Templates for Quick Start",
    description: "Click the Templates button in the toolbar to browse pre-built workflows. Drag templates from the sidebar to merge them onto your canvas.",
    target: "toolbar",
    position: "bottom",
    action: "Try loading a template",
  },
  {
    title: "5. Run Your Workflow",
    description: "Click 'Validate & Run' to execute your workflow. You'll see each step's progress, streaming LLM output, and token costs in real-time. Use {{nodeId.output}} in LLM prompts to reference upstream data.",
    target: "run-button",
    position: "bottom",
    action: "Build a workflow and hit Run!",
  },
];

type OnboardingTourProps = {
  onComplete: () => void;
  onSkip: () => void;
};

export function OnboardingTour({ onComplete, onSkip }: OnboardingTourProps) {
  const [step, setStep] = React.useState(0);
  const current = TOUR_STEPS[step];
  const isFirst = step === 0;
  const isLast = step === TOUR_STEPS.length - 1;

  // Determine positioning by finding actual DOM elements
  const [positionStyles, setPositionStyles] = React.useState<React.CSSProperties>({
    top: "50%", left: "50%", transform: "translate(-50%, -50%)",
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

    // Try to find the target element by data attribute, class, or common selectors
    const selectorMap: Record<string, string> = {
      palette: "[data-tour='palette'], .node-palette, [class*='palette']",
      inspector: "[data-tour='inspector'], .node-inspector, [class*='inspector']",
      toolbar: "[data-tour='toolbar'], header, [class*='toolbar'], .flex.items-center.justify-between",
      "run-button": "[data-tour='run'], button:has(> :last-child)",
      canvas: "[data-tour='canvas'], .react-flow, [class*='react-flow']",
    };

    const selector = selectorMap[current.target];
    const el = selector ? document.querySelector(selector) : null;

    if (el) {
      const rect = el.getBoundingClientRect();
      if (current.position === "right") {
        styles.top = `${rect.top + 20}px`;
        styles.left = `${rect.right + 16}px`;
      } else if (current.position === "left") {
        styles.top = `${rect.top + 20}px`;
        styles.right = `${window.innerWidth - rect.left + 16}px`;
      } else if (current.position === "bottom") {
        styles.top = `${rect.bottom + 12}px`;
        styles.right = `${window.innerWidth - rect.right}px`;
      } else if (current.position === "top") {
        styles.bottom = `${window.innerHeight - rect.top + 12}px`;
        styles.left = `${rect.left}px`;
      }
    } else {
      // Fallback: reasonable defaults based on target name
      if (current.target === "palette") {
        styles.top = "120px";
        styles.left = "220px";
      } else if (current.target === "inspector") {
        styles.top = "120px";
        styles.right = "320px";
      } else if (current.target === "toolbar" || current.target === "run-button") {
        styles.top = "60px";
        styles.right = "200px";
      } else {
        styles.top = "50%";
        styles.left = "50%";
        styles.transform = "translate(-50%, -50%)";
      }
    }
    setPositionStyles(styles);
  }, [step, current.target, current.position]);

  return (
    <div className="absolute inset-0 z-50 pointer-events-none">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 pointer-events-auto" onClick={onSkip} />

      {/* Tour card */}
      <div
        className="absolute z-50 w-80 pointer-events-auto"
        style={positionStyles}
      >
        <div className="rounded-xl border border-primary/30 bg-neutral-900/98 p-5 shadow-2xl backdrop-blur-md">
          {/* Progress dots */}
          <div className="flex items-center gap-1.5 mb-3">
            {TOUR_STEPS.map((_, i) => (
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

          <h3 className="text-sm font-semibold text-foreground mb-2">
            {current.title}
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed mb-3">
            {current.description}
          </p>

          {current.action && (
            <div className="flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 mb-4">
              <span className="text-primary text-xs">→</span>
              <span className="text-xs text-primary/80">{current.action}</span>
            </div>
          )}

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
                {isLast ? "Get Started" : "Next"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function useOnboarding(prefix = "athena") {
  const key = `${prefix}:onboarding-completed`;
  const [showTour, setShowTour] = React.useState(false);

  React.useEffect(() => {
    const completed = localStorage.getItem(key);
    if (!completed) {
      // Small delay so the UI renders first
      const timer = setTimeout(() => setShowTour(true), 500);
      return () => clearTimeout(timer);
    }
  }, [key]);

  const completeTour = React.useCallback(() => {
    localStorage.setItem(key, "completed");
    setShowTour(false);
  }, [key]);

  const skipTour = React.useCallback(() => {
    localStorage.setItem(key, "skipped");
    setShowTour(false);
  }, [key]);

  const resetTour = React.useCallback(() => {
    localStorage.removeItem(key);
    setShowTour(true);
  }, [key]);

  return { showTour, completeTour, skipTour, resetTour };
}
