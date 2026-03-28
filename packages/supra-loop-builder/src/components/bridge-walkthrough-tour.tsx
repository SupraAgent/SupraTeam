"use client";

import * as React from "react";
import { TourCard } from "./tour-card";
import type { TourStepDef } from "./tour-card";

// ── Step definitions ────────────────────────────────────────────

const BRIDGE_TOUR_STEPS: TourStepDef[] = [
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
      "The final node produces a structured report with every improvement plan, feedback, and updated scores. By default it logs to the execution panel. Switch it to 'file' to save reports locally.",
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

const BRIDGE_SELECTOR_MAP: Record<string, string> = {
  "bridge-trigger": "[data-id='bridge-trigger'], [data-tour='bridge-trigger']",
  "bridge-llm-1": "[data-id='bridge-llm-1'], [data-tour='bridge-llm-1']",
  "bridge-llm-2": "[data-id='bridge-llm-2'], [data-tour='bridge-llm-2']",
  "bridge-llm-3": "[data-id='bridge-llm-3'], [data-tour='bridge-llm-3']",
  "bridge-merge": "[data-id='bridge-merge'], [data-tour='bridge-merge']",
  "bridge-cpo": "[data-id='bridge-cpo'], [data-tour='bridge-cpo']",
  "bridge-rescore": "[data-id='bridge-rescore'], [data-tour='bridge-rescore']",
  "bridge-output": "[data-id='bridge-output'], [data-tour='bridge-output']",
  "run-button": "[data-tour='run'], button[aria-label*='Run'], button[aria-label*='Validate']",
};

// ── Hook: manage bridge tour state ──────────────────────────────

export function useBridgeTour(prefix = "suprateam_loop") {
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
  return (
    <TourCard
      steps={BRIDGE_TOUR_STEPS}
      selectorMap={BRIDGE_SELECTOR_MAP}
      onComplete={onComplete}
      onSkip={onSkip}
      lastButtonLabel="Start Improving"
      scrollToTarget
    />
  );
}
