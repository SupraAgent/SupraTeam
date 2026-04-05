export type InputType = "text" | "textarea" | "number" | "url" | "combobox" | "multi-combobox";

export type Option = { value: string; label: string };

export type FieldDef = {
  key: string;
  label: string;
  inputType: InputType;
  options?: Option[];
  required?: boolean;
  placeholder?: string;
  helperText?: string;
};

export type FormSection = {
  id: string;
  title: string;
  subtitle: string;
  fields: FieldDef[];
};

export type FormData = Record<string, string | string[]>;

export type FormPhase = "filling" | "reviewing" | "submitting" | "done" | "error";

export type FormState = {
  currentSection: number;
  formData: FormData;
  errors: Record<string, string>;
  phase: FormPhase;
  direction: "forward" | "back";
  dealId: string | null;
  referenceCode: string | null;
  score: number | null;
  submitError: string | null;
};

export type FormAction =
  | { type: "NEXT_SECTION" }
  | { type: "PREV_SECTION" }
  | { type: "GO_TO_SECTION"; index: number }
  | { type: "SET_FIELD"; key: string; value: string | string[] }
  | { type: "SET_ERRORS"; errors: Record<string, string> }
  | { type: "CLEAR_ERROR"; key: string }
  | { type: "START_REVIEW" }
  | { type: "CONFIRM_SUBMIT" }
  | { type: "SUBMIT_SUCCESS"; dealId: string; referenceCode: string; score: number }
  | { type: "SUBMIT_ERROR"; error: string };

export const SECTIONS: FormSection[] = [
  {
    id: "project",
    title: "Your Project",
    subtitle: "Tell us about what you're building",
    fields: [
      {
        key: "project_name",
        label: "Project Name",
        inputType: "text",
        required: true,
        placeholder: "e.g. SupraSwap",
      },
      {
        key: "project_description",
        label: "Project Description",
        inputType: "textarea",
        required: true,
        placeholder: "Describe your project in a few sentences...",
      },
      {
        key: "project_category",
        label: "Category",
        inputType: "combobox",
        required: true,
        placeholder: "Select a category",
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
        key: "project_stage",
        label: "Project Stage",
        inputType: "combobox",
        required: true,
        placeholder: "Select current stage",
        options: [
          { value: "Idea", label: "Idea" },
          { value: "MVP/Prototype", label: "MVP / Prototype" },
          { value: "Beta", label: "Beta" },
          { value: "Live/Production", label: "Live / Production" },
        ],
      },
    ],
  },
  {
    id: "needs",
    title: "What You Need",
    subtitle: "Tell us how we can help",
    fields: [
      {
        key: "applying_for",
        label: "Applying For",
        inputType: "multi-combobox",
        required: true,
        placeholder: "Select all that apply",
        options: [
          { value: "Grant", label: "Grant" },
          { value: "Funding/Investment", label: "Funding / Investment" },
          { value: "Marketing Support", label: "Marketing Support" },
          { value: "Technical Support", label: "Technical Support" },
          { value: "Partnership", label: "Partnership" },
        ],
      },
      {
        key: "supra_tech_used",
        label: "Supra Technologies Used",
        inputType: "multi-combobox",
        required: true,
        placeholder: "Select all that apply",
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
        key: "funding_requested",
        label: "Funding Requested (USD)",
        inputType: "number",
        placeholder: "e.g. 50000",
        helperText: "Leave blank if not applicable",
      },
    ],
  },
  {
    id: "links",
    title: "Links & Team",
    subtitle: "Help us learn more about you",
    fields: [
      {
        key: "project_website",
        label: "Project Website",
        inputType: "url",
        placeholder: "https://yourproject.com",
      },
      {
        key: "github_url",
        label: "GitHub Repository",
        inputType: "url",
        placeholder: "https://github.com/your-org/repo",
      },
      {
        key: "demo_url",
        label: "Demo URL",
        inputType: "url",
        placeholder: "https://demo.yourproject.com",
      },
      {
        key: "twitter_handle",
        label: "Twitter / X Handle",
        inputType: "text",
        placeholder: "@yourproject",
      },
      {
        key: "team_size",
        label: "Team Size",
        inputType: "number",
        placeholder: "e.g. 5",
      },
    ],
  },
  {
    id: "review",
    title: "Review & Submit",
    subtitle: "Double-check everything before submitting",
    fields: [],
  },
];
