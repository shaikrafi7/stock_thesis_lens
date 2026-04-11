"use client";

import { useState } from "react";
import AddStockInline from "./AddStockInline";
import { PlusCircle, Zap, Activity, ChevronDown, ChevronUp, BookOpen, AlertTriangle, CheckCircle } from "lucide-react";

const STEPS = [
  {
    icon: PlusCircle,
    title: "Add a stock",
    description: "Search by ticker (e.g. AAPL, NVDA) to add a stock to your portfolio.",
  },
  {
    icon: Zap,
    title: "Review the thesis",
    description: "ThesisArc drafts thesis points across 6 categories. Uncheck anything generic — you own this thesis.",
  },
  {
    icon: Activity,
    title: "Evaluate it",
    description: "Score your thesis against real market signals. Re-evaluate weekly to track conviction.",
  },
];

const GOOD_THESIS: { good: string; bad: string }[] = [
  {
    good: "NVDA's CUDA ecosystem creates a multi-year switching cost moat: 4M+ developers would take 18+ months to retrain on alternatives.",
    bad: "NVDA has a strong competitive position.",
  },
  {
    good: "AAPL Services revenue grows 15%+ annually through 2026 as installed base monetization deepens — falsified if Services growth drops below 10% for two consecutive quarters.",
    bad: "Apple will grow revenue because people love iPhones.",
  },
  {
    good: "MSFT Azure gaining enterprise share: 5 of 9 hyperscaler deals in Q3 FY24 were Azure-led vs AWS. Thesis breaks if Azure growth falls below 25% YoY.",
    bad: "Microsoft has a lot of enterprise customers.",
  },
];

interface Props {
  onAdded: () => void;
  portfolioId: number | null | undefined;
}

export default function OnboardingGuide({ onAdded, portfolioId }: Props) {
  const [added, setAdded] = useState(false);
  const [educationOpen, setEducationOpen] = useState(false);

  return (
    <div className="max-w-2xl mx-auto px-6 py-16 flex flex-col items-center gap-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Welcome to ThesisArc</h2>
        <p className="text-gray-400 dark:text-zinc-500 text-sm max-w-md">
          Build and stress-test your investment convictions with AI-assisted thesis tracking.
        </p>
      </div>

      {/* Steps */}
      <div className="w-full flex flex-col sm:flex-row gap-4">
        {STEPS.map((step, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-3 p-5 rounded-2xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-center">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              i === 0 && !added ? "bg-accent/10 text-accent" :
              i === 0 && added ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400" :
              "bg-gray-100 dark:bg-zinc-800 text-gray-400 dark:text-zinc-500"
            }`}>
              <step.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-zinc-200 mb-1">
                <span className="text-gray-400 dark:text-zinc-600 font-normal mr-1.5">{i + 1}.</span>
                {step.title}
              </p>
              <p className="text-xs text-gray-400 dark:text-zinc-500 leading-relaxed">{step.description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Thesis fundamentals education — collapsible */}
      <div className="w-full border border-gray-200 dark:border-zinc-800 rounded-2xl overflow-hidden bg-white dark:bg-zinc-900">
        <button
          onClick={() => setEducationOpen((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-semibold text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
        >
          <span className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-accent" />
            What makes a good thesis point?
          </span>
          {educationOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>

        {educationOpen && (
          <div className="px-5 pb-5 flex flex-col gap-5 border-t border-gray-100 dark:border-zinc-800 pt-4">
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold text-gray-600 dark:text-zinc-400 uppercase tracking-wide">The three rules</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { label: "Specific", desc: "Names real numbers, timeframes, or mechanisms. Not just 'strong brand.'" },
                  { label: "Falsifiable", desc: "States what would prove it wrong. If nothing could break it, it's not a thesis." },
                  { label: "Time-bound", desc: "Has a horizon — 12 months, 3 years. Vague 'long-term' theses drift." },
                ].map((rule) => (
                  <div key={rule.label} className="p-3 rounded-xl bg-gray-50 dark:bg-zinc-800 border border-gray-100 dark:border-zinc-700">
                    <p className="text-xs font-semibold text-accent mb-1">{rule.label}</p>
                    <p className="text-[11px] text-gray-500 dark:text-zinc-400 leading-snug">{rule.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-gray-600 dark:text-zinc-400 uppercase tracking-wide">Examples</p>
              {GOOD_THESIS.map((ex, i) => (
                <div key={i} className="flex flex-col gap-1.5 p-3 rounded-xl border border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-800/50">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-gray-700 dark:text-zinc-300 leading-snug">{ex.good}</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-gray-400 dark:text-zinc-500 leading-snug line-through">{ex.bad}</p>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-blue-600 dark:text-blue-400 leading-snug bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-800 rounded-lg px-3 py-2">
              ThesisArc generates a starting draft — but <strong>you should edit it</strong> to reflect your actual reasoning. The AI doesn&apos;t know your time horizon, risk tolerance, or why you believe in this stock.
            </p>
          </div>
        )}
      </div>

      {/* Add stock CTA */}
      <div className="flex flex-col items-center gap-2">
        <p className="text-xs text-gray-400 dark:text-zinc-500">Ready? Add your first stock:</p>
        <AddStockInline
          onAdded={() => { setAdded(true); onAdded(); }}
          portfolioId={portfolioId}
        />
      </div>
    </div>
  );
}
