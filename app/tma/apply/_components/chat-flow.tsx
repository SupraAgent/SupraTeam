"use client";

import * as React from "react";
import { STEPS, type FlowState, type FlowAction, type Message } from "./types";
import { ChatBubble } from "./chat-bubble";
import { TypingIndicator } from "./typing-indicator";
import { ProgressBar } from "./progress-bar";
import { StepInput } from "./step-input";
import { SummaryCard } from "./summary-card";

let msgCounter = 0;
function msgId() {
  return `msg-${Date.now()}-${++msgCounter}`;
}

function reducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case "ADD_BOT_MESSAGE":
      return {
        ...state,
        messages: [
          ...state.messages,
          { id: msgId(), role: "bot", content: action.content, stepId: action.stepId },
        ],
      };

    case "ANSWER": {
      const newMessages: Message[] = [
        ...state.messages,
        { id: msgId(), role: "user", content: action.displayText, stepId: action.stepId },
      ];
      const nextStep = state.currentStep + 1;
      const isLast = nextStep >= STEPS.length;

      return {
        ...state,
        currentStep: nextStep,
        answers: { ...state.answers, [action.stepId]: action.value },
        messages: newMessages,
        phase: isLast ? "reviewing" : "chatting",
      };
    }

    case "START_REVIEW":
      return { ...state, phase: "reviewing" };

    case "EDIT_FIELD": {
      const stepIdx = STEPS.findIndex((s) => s.fieldKey === action.fieldKey);
      return {
        ...state,
        editingField: action.fieldKey,
        currentStep: stepIdx >= 0 ? stepIdx : state.currentStep,
        phase: "chatting",
      };
    }

    case "UPDATE_FIELD":
      return {
        ...state,
        answers: { ...state.answers, [action.fieldKey]: action.value },
        messages: [
          ...state.messages,
          { id: msgId(), role: "user", content: `Updated: ${action.displayText}`, stepId: action.fieldKey },
        ],
        editingField: null,
        phase: "reviewing",
      };

    case "CONFIRM_SUBMIT":
      return { ...state, phase: "submitting", error: null };

    case "SUBMIT_SUCCESS":
      return { ...state, phase: "done", dealId: action.dealId };

    case "SUBMIT_ERROR":
      return { ...state, phase: "reviewing", error: action.error };

    default:
      return state;
  }
}

const INITIAL_STATE: FlowState = {
  currentStep: 0,
  answers: {},
  messages: [],
  phase: "chatting",
  editingField: null,
  error: null,
  dealId: null,
};

type TelegramWebApp = {
  ready: () => void;
  expand: () => void;
  initData: string;
  initDataUnsafe: {
    user?: { id: number; first_name: string; last_name?: string; username?: string };
  };
};

export function ChatFlow() {
  const [state, dispatch] = React.useReducer(reducer, INITIAL_STATE);
  const [typing, setTyping] = React.useState(false);
  const [inputValue, setInputValue] = React.useState<string | string[]>("");
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const tgRef = React.useRef<TelegramWebApp | null>(null);

  // Init Telegram WebApp
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const w = window as unknown as { Telegram?: { WebApp: TelegramWebApp } };
      if (w.Telegram) {
        tgRef.current = w.Telegram.WebApp;
        tgRef.current.ready();
        tgRef.current.expand();
      }
    }
  }, []);

  // Send welcome + first question on mount
  React.useEffect(() => {
    const firstName = tgRef.current?.initDataUnsafe?.user?.first_name || "there";

    setTyping(true);
    const t1 = setTimeout(() => {
      dispatch({
        type: "ADD_BOT_MESSAGE",
        content: `Hey ${firstName}! Welcome to the SuperDapp Competition. I'll walk you through the application — it only takes a few minutes.`,
      });
      setTyping(false);

      // Ask first question after a short delay
      setTimeout(() => {
        setTyping(true);
        setTimeout(() => {
          dispatch({
            type: "ADD_BOT_MESSAGE",
            content: STEPS[0].question,
            stepId: STEPS[0].id,
          });
          setTyping(false);
        }, 400);
      }, 300);
    }, 600);

    return () => clearTimeout(t1);
  }, []);

  // Ask next question when step changes (not on first render)
  const prevStepRef = React.useRef(0);
  React.useEffect(() => {
    if (state.currentStep === prevStepRef.current) return;
    if (state.phase !== "chatting") {
      prevStepRef.current = state.currentStep;
      return;
    }

    const step = STEPS[state.currentStep];
    if (!step) return;

    prevStepRef.current = state.currentStep;
    setInputValue(step.inputType === "multi-combobox" ? [] : "");

    setTyping(true);
    const t = setTimeout(() => {
      dispatch({ type: "ADD_BOT_MESSAGE", content: step.question, stepId: step.id });
      setTyping(false);
    }, 400);

    return () => clearTimeout(t);
  }, [state.currentStep, state.phase]);

  // Show review message when entering reviewing phase
  const shownReviewRef = React.useRef(false);
  React.useEffect(() => {
    if (state.phase === "reviewing" && !state.editingField && !shownReviewRef.current) {
      shownReviewRef.current = true;
      setTyping(true);
      const t = setTimeout(() => {
        dispatch({
          type: "ADD_BOT_MESSAGE",
          content: "Here's a summary of your application. Review everything and hit submit when you're ready!",
        });
        setTyping(false);
      }, 400);
      return () => clearTimeout(t);
    }
  }, [state.phase, state.editingField]);

  // Auto-scroll
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [state.messages, typing, state.phase]);

  const currentStep = STEPS[state.currentStep];

  const handleAnswer = () => {
    if (!currentStep) return;

    const val = inputValue;
    const isEmpty = Array.isArray(val) ? val.length === 0 : !val?.toString().trim();

    if (currentStep.required && isEmpty) return;

    // Format display text
    let displayText: string;
    if (Array.isArray(val)) {
      const labels = val
        .map((v) => currentStep.options?.find((o) => o.value === v)?.label || v)
        .join(", ");
      displayText = labels || "—";
    } else if (currentStep.inputType === "combobox") {
      displayText = currentStep.options?.find((o) => o.value === val)?.label || (val as string);
    } else if (currentStep.inputType === "number" && val) {
      displayText = `$${Number(val).toLocaleString()}`;
    } else {
      displayText = (val as string) || "Skipped";
    }

    if (state.editingField) {
      dispatch({ type: "UPDATE_FIELD", fieldKey: state.editingField, value: val, displayText });
    } else {
      dispatch({ type: "ANSWER", stepId: currentStep.id, value: val, displayText });
    }

    setInputValue(currentStep.inputType === "multi-combobox" ? [] : "");
  };

  const handleEdit = (fieldKey: string) => {
    const step = STEPS.find((s) => s.fieldKey === fieldKey);
    if (!step) return;

    const existingVal = state.answers[fieldKey];
    setInputValue(existingVal ?? (step.inputType === "multi-combobox" ? [] : ""));
    dispatch({ type: "EDIT_FIELD", fieldKey });
  };

  const handleSubmit = async () => {
    dispatch({ type: "CONFIRM_SUBMIT" });

    try {
      const initData = tgRef.current?.initData || "";
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initData,
          ...state.answers,
          // Convert funding_requested to number
          funding_requested: state.answers.funding_requested
            ? Number(state.answers.funding_requested)
            : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submission failed");

      dispatch({ type: "SUBMIT_SUCCESS", dealId: data.deal_id });
    } catch (err) {
      dispatch({
        type: "SUBMIT_ERROR",
        error: err instanceof Error ? err.message : "Something went wrong",
      });
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-[var(--tg-theme-bg-color,hsl(225,35%,5%))]">
      {/* Header */}
      <div className="shrink-0 px-4 pt-4 pb-3 border-b border-white/5">
        <h1 className="text-base font-semibold text-white">SuperDapp Application</h1>
        {state.phase === "chatting" && (
          <div className="mt-2">
            <ProgressBar current={state.currentStep} total={STEPS.length} />
          </div>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {state.messages.map((msg) => (
          <ChatBubble key={msg.id} role={msg.role}>
            {msg.content}
          </ChatBubble>
        ))}

        {typing && <TypingIndicator />}

        {/* Summary card */}
        {(state.phase === "reviewing" || state.phase === "submitting" || state.phase === "done") &&
          !state.editingField &&
          !typing && (
            <SummaryCard
              answers={state.answers}
              phase={state.phase}
              error={state.error}
              onEdit={handleEdit}
              onSubmit={handleSubmit}
            />
          )}
      </div>

      {/* Input area */}
      {state.phase === "chatting" && currentStep && !typing && (
        <div className="shrink-0 px-4 pb-4 pt-2 border-t border-white/5">
          <StepInput
            step={currentStep}
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleAnswer}
          />
        </div>
      )}
    </div>
  );
}
