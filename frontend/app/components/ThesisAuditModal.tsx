"use client";

import { useState } from "react";
import { closeThesis, type Thesis, type ThesisOutcome } from "@/lib/api";
import { X, Loader2, CheckCircle2, AlertTriangle, MinusCircle, XCircle } from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  competitive_moat: "Competitive Moat",
  growth_trajectory: "Growth Trajectory",
  valuation: "Valuation",
  financial_health: "Financial Health",
  ownership_conviction: "Ownership & Conviction",
  risks: "Risks & Bear Case",
};

const OUTCOME_OPTIONS: Array<{
  value: ThesisOutcome;
  label: string;
  description: string;
  Icon: typeof CheckCircle2;
  tone: string;
}> = [
  {
    value: "played_out",
    label: "Played out as expected",
    description: "The thesis point was confirmed by what actually happened.",
    Icon: CheckCircle2,
    tone: "text-emerald-700 dark:text-emerald-400 ring-emerald-500",
  },
  {
    value: "partial",
    label: "Partially played out",
    description: "Some of the thesis was right, some of it wasn't.",
    Icon: MinusCircle,
    tone: "text-amber-700 dark:text-amber-400 ring-amber-500",
  },
  {
    value: "failed",
    label: "Broke — thesis was wrong",
    description: "The evidence said the opposite of what you believed.",
    Icon: XCircle,
    tone: "text-rose-700 dark:text-rose-400 ring-rose-500",
  },
  {
    value: "invalidated",
    label: "No longer relevant",
    description: "The world changed; this thesis no longer applies.",
    Icon: AlertTriangle,
    tone: "text-sky-700 dark:text-sky-400 ring-sky-500",
  },
];

interface Props {
  ticker: string;
  thesis: Thesis;
  portfolioId?: number | null;
  onClose: () => void;
  onClosed: (updated: Thesis) => void;
}

export default function ThesisAuditModal({ ticker, thesis, portfolioId, onClose, onClosed }: Props) {
  const [outcome, setOutcome] = useState<ThesisOutcome | null>(null);
  const [lessons, setLessons] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = outcome !== null && lessons.trim().length >= 10 && !saving;

  async function handleSubmit() {
    if (!outcome || lessons.trim().length < 10) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await closeThesis(ticker, thesis.id, outcome, lessons.trim(), portfolioId);
      onClosed(updated);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save post-mortem.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm px-4 py-6 overflow-y-auto">
      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-2xl p-6 max-w-xl w-full shadow-2xl flex flex-col gap-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Close &amp; Audit This Thesis
            </h2>
            <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
              Write down what you learned. This becomes part of your decision journal.
            </p>
          </div>
          <button
            aria-label="Close"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-gray-50 dark:bg-zinc-800/60 rounded-lg p-3 border border-gray-200 dark:border-zinc-700">
          <div className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-zinc-400 font-medium">
            {CATEGORY_LABELS[thesis.category] || thesis.category} · {ticker}
          </div>
          <div className="text-sm text-gray-900 dark:text-zinc-100 mt-1 leading-snug">
            {thesis.statement}
          </div>
        </div>

        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-white mb-2">
            How did this thesis play out?
          </div>
          <div className="grid grid-cols-1 gap-2">
            {OUTCOME_OPTIONS.map((opt) => {
              const selected = outcome === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setOutcome(opt.value)}
                  className={`flex items-start gap-3 text-left p-3 rounded-lg border transition-colors ${
                    selected
                      ? "border-transparent ring-2 bg-white dark:bg-zinc-800 " + opt.tone
                      : "border-gray-200 dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600"
                  }`}
                >
                  <opt.Icon className={`w-5 h-5 mt-0.5 shrink-0 ${selected ? "" : "text-gray-400 dark:text-zinc-500"}`} />
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">{opt.label}</div>
                    <div className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">{opt.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label
            htmlFor="lessons"
            className="text-sm font-medium text-gray-900 dark:text-white block mb-2"
          >
            What did you learn?
          </label>
          <textarea
            id="lessons"
            rows={4}
            value={lessons}
            onChange={(e) => setLessons(e.target.value)}
            placeholder="What surprised you? What would you do differently next time? Which signals would have told you earlier?"
            className="w-full text-sm rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <div className="text-xs text-gray-500 dark:text-zinc-400 mt-1">
            {lessons.trim().length < 10
              ? `At least 10 characters. ${Math.max(0, 10 - lessons.trim().length)} to go.`
              : `${lessons.trim().length} characters.`}
          </div>
        </div>

        {error ? (
          <div className="text-sm text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-900 rounded-lg p-2">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-300 dark:disabled:bg-zinc-700 disabled:text-gray-500 dark:disabled:text-zinc-500 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save post-mortem
          </button>
        </div>
      </div>
    </div>
  );
}
