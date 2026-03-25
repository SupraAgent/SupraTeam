export type InputType = "text" | "textarea" | "number" | "url" | "combobox" | "multi-combobox";

export type StepDef = {
  id: string;
  question: string;
  fieldKey: string;
  inputType: InputType;
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
};

export type Message = {
  id: string;
  role: "bot" | "user";
  content: string;
  stepId?: string;
};

export type FlowPhase = "chatting" | "reviewing" | "submitting" | "done" | "error";

export type FlowState = {
  currentStep: number;
  answers: Record<string, string | string[]>;
  messages: Message[];
  phase: FlowPhase;
  editingField: string | null;
  error: string | null;
  dealId: string | null;
};

export type FlowAction =
  | { type: "ADD_BOT_MESSAGE"; content: string; stepId?: string }
  | { type: "ANSWER"; stepId: string; value: string | string[]; displayText: string }
  | { type: "START_REVIEW" }
  | { type: "EDIT_FIELD"; fieldKey: string }
  | { type: "UPDATE_FIELD"; fieldKey: string; value: string | string[]; displayText: string }
  | { type: "CONFIRM_SUBMIT" }
  | { type: "SUBMIT_SUCCESS"; dealId: string }
  | { type: "SUBMIT_ERROR"; error: string };

export const STEPS: StepDef[] = [
  {
    id: "project_name",
    question: "What's the name of your project?",
    fieldKey: "project_name",
    inputType: "text",
    required: true,
    placeholder: "e.g. SupraSwap",
  },
  {
    id: "project_description",
    question: "Give us a brief description of what your project does.",
    fieldKey: "project_description",
    inputType: "textarea",
    required: true,
    placeholder: "Describe your project in a few sentences...",
  },
  {
    id: "project_category",
    question: "What category best describes your project?",
    fieldKey: "project_category",
    inputType: "combobox",
    required: true,
    options: [
      { value: "DeFi", label: "DeFi" },
      { value: "Gaming", label: "Gaming" },
      { value: "NFT/Digital Assets", label: "NFT / Digital Assets" },
      { value: "Infrastructure", label: "Infrastructure" },
      { value: "Social/Community", label: "Social / Community" },
      { value: "DAO/Governance", label: "DAO / Governance" },
      { value: "Developer Tools", label: "Developer Tools" },
      { value: "Other", label: "Other" },
    ],
  },
  {
    id: "project_stage",
    question: "What stage is your project at?",
    fieldKey: "project_stage",
    inputType: "combobox",
    required: true,
    options: [
      { value: "Idea", label: "Idea" },
      { value: "MVP/Prototype", label: "MVP / Prototype" },
      { value: "Beta", label: "Beta" },
      { value: "Live/Production", label: "Live / Production" },
    ],
  },
  {
    id: "applying_for",
    question: "What are you applying for? (select all that apply)",
    fieldKey: "applying_for",
    inputType: "multi-combobox",
    required: true,
    options: [
      { value: "Grant", label: "Grant" },
      { value: "Funding/Investment", label: "Funding / Investment" },
      { value: "Marketing Support", label: "Marketing Support" },
      { value: "Technical Support", label: "Technical Support" },
      { value: "Partnership", label: "Partnership" },
    ],
  },
  {
    id: "supra_tech_used",
    question: "Which Supra technologies are you using? (select all that apply)",
    fieldKey: "supra_tech_used",
    inputType: "multi-combobox",
    required: true,
    options: [
      { value: "Move VM", label: "Move VM" },
      { value: "dVRF", label: "dVRF" },
      { value: "Automation Network", label: "Automation Network" },
      { value: "Cross-chain Bridge", label: "Cross-chain Bridge" },
      { value: "Oracle/Price Feeds", label: "Oracle / Price Feeds" },
      { value: "Other", label: "Other" },
    ],
  },
  {
    id: "project_website",
    question: "What's your project website? (optional)",
    fieldKey: "project_website",
    inputType: "url",
    placeholder: "https://yourproject.com",
  },
  {
    id: "github_url",
    question: "Got a GitHub repo? (optional)",
    fieldKey: "github_url",
    inputType: "url",
    placeholder: "https://github.com/your-org/repo",
  },
  {
    id: "funding_requested",
    question: "How much funding are you requesting in USD? (optional)",
    fieldKey: "funding_requested",
    inputType: "number",
    placeholder: "e.g. 50000",
  },
];
