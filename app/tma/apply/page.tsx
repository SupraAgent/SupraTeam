"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Copy,
  Check,
  ChevronDown,
} from "lucide-react";

type TelegramWebApp = {
  ready: () => void;
  expand: () => void;
  initData: string;
  initDataUnsafe: {
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
    };
  };
};

interface FormValues {
  project_name: string;
  project_description: string;
  project_category: string;
  project_stage: string;
  applying_for: string[];
  supra_tech_used: string[];
  funding_requested: string;
  project_website: string;
  github_url: string;
  demo_url: string;
  twitter_handle: string;
  team_size: string;
}

const INITIAL_FORM: FormValues = {
  project_name: "",
  project_description: "",
  project_category: "",
  project_stage: "",
  applying_for: [],
  supra_tech_used: [],
  funding_requested: "",
  project_website: "",
  github_url: "",
  demo_url: "",
  twitter_handle: "",
  team_size: "",
};

const CATEGORIES = [
  "DeFi",
  "Gaming",
  "NFT/Digital Assets",
  "Infrastructure",
  "Social/Community",
  "DAO/Governance",
  "Developer Tools",
  "Other",
];

const STAGES = ["Idea", "MVP/Prototype", "Beta", "Live/Production"];

const APPLYING_FOR_OPTIONS = [
  "Grant",
  "Funding/Investment",
  "Marketing Support",
  "Technical Support",
  "Partnership",
];

const SUPRA_TECH_OPTIONS = [
  "Move VM",
  "dVRF",
  "Automation Network",
  "Cross-chain Bridge",
  "Oracle/Price Feeds",
  "Other",
];

const APPLICATION_PROGRESS = [
  "Submitted",
  "Under Review",
  "Shortlisted",
  "Approved",
];

/** Mobile select dropdown */
function MobileSelect({
  label,
  required,
  value,
  onChange,
  options,
  placeholder,
  error,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        {label}
        {required && (
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
        )}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "h-10 w-full appearance-none rounded-xl border bg-white/5 px-3 text-sm text-foreground outline-none transition",
            "focus:border-primary/40 focus:ring-2 focus:ring-primary/15",
            error ? "border-red-400/60" : "border-white/10",
            !value && "text-muted-foreground"
          )}
        >
          <option value="">{placeholder}</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

/** Mobile multi-select with toggleable chips */
function MobileMultiSelect({
  label,
  required,
  value,
  onChange,
  options,
  error,
}: {
  label: string;
  required?: boolean;
  value: string[];
  onChange: (v: string[]) => void;
  options: string[];
  error?: string;
}) {
  const toggle = (opt: string) => {
    if (value.includes(opt)) {
      onChange(value.filter((v) => v !== opt));
    } else {
      onChange([...value, opt]);
    }
  };

  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        {label}
        {required && (
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
        )}
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const selected = value.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                selected
                  ? "bg-primary/15 border-primary/30 text-primary"
                  : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
              )}
            >
              {selected && <Check className="inline w-3 h-3 mr-1" />}
              {opt}
            </button>
          );
        })}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

export default function TMAApplyPage() {
  const [form, setForm] = React.useState<FormValues>(INITIAL_FORM);
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormValues, string>>>({});
  const [phase, setPhase] = React.useState<"filling" | "submitting" | "done" | "error">("filling");
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [referenceCode, setReferenceCode] = React.useState<string | null>(null);
  const [score, setScore] = React.useState<number | null>(null);
  const [copied, setCopied] = React.useState(false);

  const [tgData, setTgData] = React.useState<{
    initData: string;
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
    };
  } | null>(null);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const w = window as unknown as {
        Telegram?: { WebApp: TelegramWebApp };
      };
      if (w.Telegram) {
        const webapp = w.Telegram.WebApp;
        webapp.ready();
        webapp.expand();
        setTgData({
          initData: webapp.initData,
          user: webapp.initDataUnsafe?.user,
        });
        // Auto-fill twitter handle from username
        if (webapp.initDataUnsafe?.user?.username) {
          setForm((prev) => ({
            ...prev,
            twitter_handle: `@${webapp.initDataUnsafe.user!.username}`,
          }));
        }
      } else {
        setTgData({ initData: "" });
      }
    }
  }, []);

  const setField = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof FormValues, string>> = {};
    if (!form.project_name.trim()) newErrors.project_name = "Required";
    if (!form.project_description.trim()) newErrors.project_description = "Required";
    if (!form.project_category) newErrors.project_category = "Required";
    if (!form.project_stage) newErrors.project_stage = "Required";
    if (form.applying_for.length === 0) newErrors.applying_for = "Select at least one";
    if (form.supra_tech_used.length === 0) newErrors.supra_tech_used = "Select at least one";

    // Validate URLs
    const urlFields: (keyof FormValues)[] = ["project_website", "github_url", "demo_url"];
    for (const field of urlFields) {
      const val = form[field];
      if (typeof val === "string" && val.trim()) {
        try {
          new URL(val);
        } catch {
          newErrors[field] = "Enter a valid URL";
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) {
      // Scroll to first error
      const firstError = document.querySelector("[data-error='true']");
      firstError?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setPhase("submitting");
    setSubmitError(null);

    try {
      const payload: Record<string, unknown> = {
        project_name: form.project_name,
        project_description: form.project_description,
        project_category: form.project_category,
        project_stage: form.project_stage,
        applying_for: form.applying_for,
        supra_tech_used: form.supra_tech_used,
        funding_requested: form.funding_requested ? Number(form.funding_requested) : undefined,
        project_website: form.project_website || undefined,
        github_url: form.github_url || undefined,
        demo_url: form.demo_url || undefined,
        twitter_handle: form.twitter_handle || undefined,
        team_size: form.team_size ? Number(form.team_size) : undefined,
      };

      if (tgData?.initData) {
        payload.initData = tgData.initData;
      }

      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submission failed");

      setReferenceCode(data.reference_code ?? null);
      setScore(data.score ?? null);
      setPhase("done");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong");
      setPhase("error");
    }
  };

  const handleCopyRef = () => {
    if (!referenceCode) return;
    navigator.clipboard
      .writeText(referenceCode)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  if (!tgData) {
    return (
      <div className="flex items-center justify-center h-dvh">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const greeting = tgData.user?.first_name || "there";

  // Success screen
  if (phase === "done") {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh px-4 py-8 text-center space-y-6">
        <div>
          <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-4 mx-auto">
            <CheckCircle2 className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">
            Application Submitted!
          </h2>
          <p className="text-sm text-white/50 max-w-sm">
            We&apos;ll review your application and get back to you. Good luck!
          </p>
        </div>

        {referenceCode && (
          <div className="w-full max-w-sm rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
            <p className="text-xs text-white/50">Your reference number</p>
            <div className="flex items-center justify-center gap-2">
              <span className="text-2xl font-bold text-primary font-mono tracking-wider">
                {referenceCode}
              </span>
              <button
                onClick={handleCopyRef}
                className="p-1.5 rounded-lg hover:bg-white/5 transition-colors text-white/40"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
            <p className="text-[10px] text-white/30">
              Save this to track your application status
            </p>
          </div>
        )}

        {score !== null && (
          <div className="w-full max-w-sm rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-white/50">Application Score</span>
              <span
                className={cn(
                  "text-sm font-semibold",
                  score >= 70
                    ? "text-green-400"
                    : score >= 40
                      ? "text-amber-400"
                      : "text-red-400"
                )}
              >
                {score}/100
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-1000",
                  score >= 70
                    ? "bg-green-400"
                    : score >= 40
                      ? "bg-amber-400"
                      : "bg-red-400"
                )}
                style={{ width: `${score}%` }}
              />
            </div>
          </div>
        )}

        {/* Progress visualization */}
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-between">
            {APPLICATION_PROGRESS.map((stage, idx) => (
              <React.Fragment key={stage}>
                {idx > 0 && (
                  <div className={cn("h-0.5 flex-1 mx-1", "bg-white/10")} />
                )}
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold border-2",
                      idx === 0
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-white/20 text-white/30"
                    )}
                  >
                    {idx === 0 ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      idx + 1
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-[9px]",
                      idx === 0 ? "text-primary" : "text-white/30"
                    )}
                  >
                    {stage}
                  </span>
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[hsl(225,35%,5%)]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[hsl(225,35%,5%)]/95 backdrop-blur-sm px-4 pt-4 pb-3 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <span className="text-primary text-sm font-bold">S</span>
          </div>
          <div>
            <h1 className="text-base font-semibold text-white">
              SuperDapp Competition
            </h1>
            <p className="text-xs text-white/40">Hey {greeting}!</p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="px-4 py-5 space-y-5 pb-32">
        {/* Section: Project Details */}
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-white/80">Your Project</h2>
          <div className="h-px bg-white/5" />
        </div>

        <div className="space-y-1.5" data-error={!!errors.project_name}>
          <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            Project Name
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          </label>
          <Input
            value={form.project_name}
            onChange={(e) => setField("project_name", e.target.value)}
            placeholder="e.g. SupraSwap"
            className={errors.project_name ? "border-red-500/50" : ""}
          />
          {errors.project_name && (
            <p className="text-xs text-red-400">{errors.project_name}</p>
          )}
        </div>

        <div className="space-y-1.5" data-error={!!errors.project_description}>
          <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            Description
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          </label>
          <Textarea
            value={form.project_description}
            onChange={(e) => setField("project_description", e.target.value)}
            placeholder="Describe your project..."
            rows={3}
            className={errors.project_description ? "border-red-500/50" : ""}
          />
          {errors.project_description && (
            <p className="text-xs text-red-400">{errors.project_description}</p>
          )}
        </div>

        <MobileSelect
          label="Category"
          required
          value={form.project_category}
          onChange={(v) => setField("project_category", v)}
          options={CATEGORIES}
          placeholder="Select a category"
          error={errors.project_category}
        />

        <MobileSelect
          label="Project Stage"
          required
          value={form.project_stage}
          onChange={(v) => setField("project_stage", v)}
          options={STAGES}
          placeholder="Select current stage"
          error={errors.project_stage}
        />

        {/* Section: What You Need */}
        <div className="space-y-1 pt-3">
          <h2 className="text-sm font-semibold text-white/80">What You Need</h2>
          <div className="h-px bg-white/5" />
        </div>

        <MobileMultiSelect
          label="Applying For"
          required
          value={form.applying_for}
          onChange={(v) => setField("applying_for", v)}
          options={APPLYING_FOR_OPTIONS}
          error={errors.applying_for}
        />

        <MobileMultiSelect
          label="Supra Technologies Used"
          required
          value={form.supra_tech_used}
          onChange={(v) => setField("supra_tech_used", v)}
          options={SUPRA_TECH_OPTIONS}
          error={errors.supra_tech_used}
        />

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            Funding Requested (USD)
          </label>
          <Input
            type="number"
            value={form.funding_requested}
            onChange={(e) => setField("funding_requested", e.target.value)}
            placeholder="e.g. 50000"
          />
          <p className="text-xs text-muted-foreground">
            Leave blank if not applicable
          </p>
        </div>

        {/* Section: Links & Team */}
        <div className="space-y-1 pt-3">
          <h2 className="text-sm font-semibold text-white/80">
            Links &amp; Team
          </h2>
          <div className="h-px bg-white/5" />
        </div>

        <div className="space-y-1.5" data-error={!!errors.project_website}>
          <label className="text-sm font-medium text-foreground">
            Project Website
          </label>
          <Input
            type="url"
            value={form.project_website}
            onChange={(e) => setField("project_website", e.target.value)}
            placeholder="https://yourproject.com"
            className={errors.project_website ? "border-red-500/50" : ""}
          />
          {errors.project_website && (
            <p className="text-xs text-red-400">{errors.project_website}</p>
          )}
        </div>

        <div className="space-y-1.5" data-error={!!errors.github_url}>
          <label className="text-sm font-medium text-foreground">
            GitHub Repository
          </label>
          <Input
            type="url"
            value={form.github_url}
            onChange={(e) => setField("github_url", e.target.value)}
            placeholder="https://github.com/your-org/repo"
            className={errors.github_url ? "border-red-500/50" : ""}
          />
          {errors.github_url && (
            <p className="text-xs text-red-400">{errors.github_url}</p>
          )}
        </div>

        <div className="space-y-1.5" data-error={!!errors.demo_url}>
          <label className="text-sm font-medium text-foreground">Demo URL</label>
          <Input
            type="url"
            value={form.demo_url}
            onChange={(e) => setField("demo_url", e.target.value)}
            placeholder="https://demo.yourproject.com"
            className={errors.demo_url ? "border-red-500/50" : ""}
          />
          {errors.demo_url && (
            <p className="text-xs text-red-400">{errors.demo_url}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            Twitter / X Handle
          </label>
          <Input
            value={form.twitter_handle}
            onChange={(e) => setField("twitter_handle", e.target.value)}
            placeholder="@yourproject"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            Team Size
          </label>
          <Input
            type="number"
            value={form.team_size}
            onChange={(e) => setField("team_size", e.target.value)}
            placeholder="e.g. 5"
          />
        </div>
      </div>

      {/* Submit footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-[hsl(225,35%,5%)]/95 backdrop-blur-sm border-t border-white/5 px-4 py-4">
        {submitError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 mb-3">
            <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
            <span className="text-xs text-red-300">{submitError}</span>
          </div>
        )}
        <Button
          onClick={handleSubmit}
          disabled={phase === "submitting"}
          className="w-full h-12 text-base font-medium"
          size="lg"
        >
          {phase === "submitting" ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Submitting...
            </>
          ) : (
            "Submit Application"
          )}
        </Button>
      </div>
    </div>
  );
}
