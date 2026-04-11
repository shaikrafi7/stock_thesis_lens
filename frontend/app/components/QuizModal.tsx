"use client";

import { useState, useCallback } from "react";
import { getQuizQuestion, type QuizQuestion } from "@/lib/api";
import { Brain, X, CheckCircle, XCircle, Loader2, ChevronRight } from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  competitive_moat: "Competitive Moat",
  growth_trajectory: "Growth Trajectory",
  valuation: "Valuation",
  financial_health: "Financial Health",
  ownership_conviction: "Ownership & Conviction",
  risks: "Risks & Bear Case",
};

interface Props {
  portfolioId?: number | null;
  onClose: () => void;
}

export default function QuizModal({ portfolioId, onClose }: Props) {
  const [question, setQuestion] = useState<QuizQuestion | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const loadQuestion = useCallback(async () => {
    setLoading(true);
    setSelected(null);
    setError(null);
    try {
      const q = await getQuizQuestion(portfolioId);
      setQuestion(q);
    } catch {
      setError("Need at least 2 stocks with thesis points to play.");
    } finally {
      setLoading(false);
    }
  }, [portfolioId]);

  // Load first question on mount
  useState(() => { loadQuestion(); });

  function handleAnswer(ticker: string) {
    if (selected || !question) return;
    setSelected(ticker);
    setScore((s) => ({
      correct: s.correct + (ticker === question.correct_ticker ? 1 : 0),
      total: s.total + 1,
    }));
  }

  const isRevealed = selected !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-2xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Know Your Thesis</h3>
          </div>
          <div className="flex items-center gap-3">
            {score.total > 0 && (
              <span className="text-xs text-gray-400 dark:text-zinc-500">
                {score.correct}/{score.total} correct
              </span>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-accent" />
          </div>
        )}

        {error && (
          <p className="text-xs text-gray-500 dark:text-zinc-400 text-center py-4">{error}</p>
        )}

        {!loading && !error && question && (
          <>
            <div className="bg-gray-50 dark:bg-zinc-800 rounded-xl p-4 flex flex-col gap-1.5">
              <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-zinc-500 font-semibold">
                {CATEGORY_LABELS[question.category] ?? question.category}
              </span>
              <p className="text-sm text-gray-800 dark:text-zinc-200 leading-snug">
                &ldquo;{question.statement}&rdquo;
              </p>
              <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">Which stock does this thesis point belong to?</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {question.choices.map((ticker) => {
                const isCorrect = ticker === question.correct_ticker;
                const isSelected = ticker === selected;
                let cls = "px-3 py-2.5 rounded-xl border text-sm font-mono font-semibold transition-colors text-center ";
                if (!isRevealed) {
                  cls += "border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 hover:border-accent hover:bg-accent/5 cursor-pointer";
                } else if (isCorrect) {
                  cls += "border-emerald-400 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400";
                } else if (isSelected) {
                  cls += "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400";
                } else {
                  cls += "border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-800/50 text-gray-400 dark:text-zinc-600 opacity-60";
                }
                return (
                  <button key={ticker} onClick={() => handleAnswer(ticker)} className={cls} disabled={isRevealed}>
                    <div className="flex items-center justify-center gap-1.5">
                      {isRevealed && isCorrect && <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />}
                      {isRevealed && isSelected && !isCorrect && <XCircle className="w-3.5 h-3.5 text-red-400" />}
                      {ticker}
                    </div>
                  </button>
                );
              })}
            </div>

            {isRevealed && (
              <div className={`text-xs rounded-lg px-3 py-2 ${
                selected === question.correct_ticker
                  ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
                  : "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
              }`}>
                {selected === question.correct_ticker
                  ? "Correct! You know your thesis."
                  : `This was a ${question.correct_ticker} thesis point.`}
              </div>
            )}

            <button
              onClick={loadQuestion}
              className="flex items-center justify-center gap-1.5 w-full px-4 py-2 text-xs bg-accent hover:bg-accent-hover text-white rounded-xl font-medium transition-colors"
            >
              Next question
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
