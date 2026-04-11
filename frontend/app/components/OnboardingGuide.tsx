"use client";

import { useState } from "react";
import AddStockInline from "./AddStockInline";
import { PlusCircle, Zap, Activity, ChevronRight } from "lucide-react";

const STEPS = [
  {
    icon: PlusCircle,
    title: "Add a stock",
    description: "Search by ticker (e.g. AAPL, NVDA) to add a stock to your portfolio.",
  },
  {
    icon: Zap,
    title: "Generate a thesis",
    description: "ThesisArc will draft investment thesis points across 6 categories. Review and edit them to match your view.",
  },
  {
    icon: Activity,
    title: "Evaluate it",
    description: "Run an evaluation to score your thesis against real market signals. Re-evaluate weekly to track conviction.",
  },
];

interface Props {
  onAdded: () => void;
  portfolioId: number | null | undefined;
}

export default function OnboardingGuide({ onAdded, portfolioId }: Props) {
  const [added, setAdded] = useState(false);

  return (
    <div className="max-w-2xl mx-auto px-6 py-16 flex flex-col items-center gap-10">
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
            {i < STEPS.length - 1 && (
              <ChevronRight className="hidden sm:block absolute right-0 text-gray-200 dark:text-zinc-700 w-4 h-4" />
            )}
          </div>
        ))}
      </div>

      {/* Add stock CTA */}
      <div className="flex flex-col items-center gap-2">
        <p className="text-xs text-gray-400 dark:text-zinc-500">Start by adding your first stock:</p>
        <AddStockInline
          onAdded={() => { setAdded(true); onAdded(); }}
          portfolioId={portfolioId}
        />
      </div>
    </div>
  );
}
