"use client";

import { useState } from "react";
import { createInvestorProfile, updateInvestorProfile, skipProfileWizard, type InvestorProfile, type InvestorProfileCreateRequest } from "@/lib/api";

interface Props {
  onComplete: (profile: InvestorProfile) => void;
  onSkip: () => void;
}

interface Step {
  title: string;
  subtitle: string;
  field: keyof InvestorProfileCreateRequest;
  options: { value: string; label: string; description: string }[];
}

const STEPS: Step[] = [
  {
    title: "What's your investing approach?",
    subtitle: "This shapes how your thesis points are framed.",
    field: "investment_style",
    options: [
      { value: "growth", label: "Growth", description: "Companies expanding fast — revenue, users, market share" },
      { value: "value", label: "Value", description: "Undervalued businesses trading below intrinsic worth" },
      { value: "dividend", label: "Dividend", description: "Income-generating stocks with sustainable payouts" },
      { value: "blend", label: "Blend", description: "Mix of growth and value — quality at reasonable prices" },
    ],
  },
  {
    title: "How long do you typically hold a position?",
    subtitle: "Affects how we weight near-term signals vs. long-term fundamentals.",
    field: "time_horizon",
    options: [
      { value: "short", label: "Short-term", description: "Under 1 year — momentum and near-term catalysts matter" },
      { value: "medium", label: "Medium-term", description: "1–5 years — mix of catalysts and fundamentals" },
      { value: "long", label: "Long-term", description: "5+ years — compounding, moats, and durable advantages" },
    ],
  },
  {
    title: "How much loss can you absorb?",
    subtitle: "Financial capacity — not just how it feels emotionally.",
    field: "risk_capacity",
    options: [
      { value: "low", label: "Low", description: "I need this capital relatively soon or can't afford large drawdowns" },
      { value: "medium", label: "Medium", description: "I can handle moderate swings but not prolonged large losses" },
      { value: "high", label: "High", description: "This is long-term money — I can weather significant drawdowns" },
    ],
  },
  {
    title: "Your portfolio drops 20% in 3 months. Your thesis is unchanged.",
    subtitle: "This reveals your emotional response to loss — a key behavioral predictor.",
    field: "loss_aversion",
    options: [
      { value: "high", label: "Sell some to limit further losses", description: "Capital preservation comes first" },
      { value: "medium", label: "Hold — this was expected volatility", description: "Stick to the thesis and wait it out" },
      { value: "low", label: "Buy more — this is an opportunity", description: "Drawdowns are entry points when conviction is high" },
    ],
  },
  {
    title: "How would you describe your investing experience?",
    subtitle: "Helps calibrate how AI responses are framed — technical depth and explanation level.",
    field: "experience_level",
    options: [
      { value: "beginner", label: "Beginner", description: "Still learning — prefer plain language and clear explanations" },
      { value: "intermediate", label: "Intermediate", description: "Familiar with fundamentals, earnings, and valuation basics" },
      { value: "advanced", label: "Advanced", description: "Comfortable with financial statements, models, and technical terms" },
    ],
  },
];

export default function ProfileWizard({ onComplete, onSkip }: Props) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<InvestorProfileCreateRequest>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = STEPS[step];
  const selected = answers[current.field];
  const isLast = step === STEPS.length - 1;

  function select(value: string) {
    setAnswers((a) => ({ ...a, [current.field]: value }));
  }

  async function handleNext() {
    if (!selected) return;
    if (!isLast) {
      setStep((s) => s + 1);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let profile: InvestorProfile;
      try {
        profile = await createInvestorProfile(answers as InvestorProfileCreateRequest);
      } catch {
        // Profile already exists — update instead
        profile = await updateInvestorProfile(answers as InvestorProfileCreateRequest);
      }
      onComplete(profile);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSkip() {
    try {
      await skipProfileWizard();
    } catch {
      // ignore — skip is best-effort
    }
    onSkip();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl w-full max-w-lg shadow-2xl animate-fade-up" style={{border:"1px solid rgba(255,255,255,0.08)", borderTopColor:"rgba(255,255,255,0.13)"}}>
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-white/5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-zinc-500">
              Step {step + 1} of {STEPS.length}
            </span>
            <button
              onClick={handleSkip}
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Skip for now
            </button>
          </div>
          {/* Progress bar */}
          <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-300"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Question */}
        <div className="px-6 py-5">
          <h2 className="text-base font-semibold text-white mb-1">{current.title}</h2>
          <p className="text-xs text-zinc-500 mb-5">{current.subtitle}</p>

          <div className="space-y-2">
            {current.options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => select(opt.value)}
                className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                  selected === opt.value
                    ? "border-accent/60 bg-accent/8 text-white"
                    : "border-white/6 bg-zinc-900/60 text-zinc-300 hover:border-white/12 hover:bg-zinc-800/60"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 transition-colors ${
                      selected === opt.value ? "border-accent bg-accent" : "border-zinc-600"
                    }`}
                  />
                  <div>
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{opt.description}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex items-center justify-between">
          <button
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0}
            className="text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleNext}
            disabled={!selected || loading}
            className="px-5 py-2 rounded-lg bg-accent text-black text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/90 transition-colors"
          >
            {loading ? "Building your profile..." : isLast ? "Finish" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
