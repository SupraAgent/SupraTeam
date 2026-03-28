"use client";

import * as React from "react";
import { TourCard } from "./tour-card";
import type { TourStepDef } from "./tour-card";

const TOUR_STEPS: TourStepDef[] = [
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

const SELECTOR_MAP: Record<string, string> = {
  palette: "[data-tour='palette'], .node-palette, [class*='palette']",
  inspector: "[data-tour='inspector'], .node-inspector, [class*='inspector']",
  toolbar: "[data-tour='toolbar'], header, [class*='toolbar'], .flex.items-center.justify-between",
  "run-button": "[data-tour='run'], button:has(> :last-child)",
  canvas: "[data-tour='canvas'], .react-flow, [class*='react-flow']",
};

type OnboardingTourProps = {
  onComplete: () => void;
  onSkip: () => void;
};

export function OnboardingTour({ onComplete, onSkip }: OnboardingTourProps) {
  return (
    <TourCard
      steps={TOUR_STEPS}
      selectorMap={SELECTOR_MAP}
      onComplete={onComplete}
      onSkip={onSkip}
      lastButtonLabel="Get Started"
    />
  );
}

export function useOnboarding(prefix = "suprateam_loop") {
  const key = `${prefix}:onboarding-completed`;
  const [showTour, setShowTour] = React.useState(false);

  React.useEffect(() => {
    const completed = localStorage.getItem(key);
    if (!completed) {
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
