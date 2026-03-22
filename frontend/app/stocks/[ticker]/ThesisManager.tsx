"use client";

import { useState } from "react";
import {
  generateThesis,
  updateThesisSelection,
  runEvaluation,
  type Thesis,
  type Evaluation,
} from "@/lib/api";
import StatusBadge from "@/app/components/StatusBadge";

const CATEGORY_LABELS: Record<string, string> = {
  core_beliefs: "Core Beliefs",
  strengths: "Strengths",
  risks: "Risks",
  leadership: "Leadership",
  catalysts: "Catalysts",
};

const CATEGORY_ORDER = ["core_beliefs", "strengths", "risks", "leadership", "catalysts"];

function groupByCategory(theses: Thesis[]): Record<string, Thesis[]> {
  const groups: Record<string, Thesis[]> = {};
  for (const t of theses) {
    if (!groups[t.category]) groups[t.category] = [];
    groups[t.category].push(t);
  }
  return groups;
}

interface Props {
  ticker: string;
  initialTheses: Thesis[];
  initialEvaluation: Evaluation | null;
}

export default function ThesisManager({ ticker, initialTheses, initialEvaluation }: Props) {
  const [theses, setTheses] = useState<Thesis[]>(initialTheses);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(initialEvaluation);
  const [generating, setGenerating] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState("");

  const selectedCount = theses.filter((t) => t.selected).length;
  const groups = groupByCategory(theses);

  async function handleGenerate() {
    setGenerating(true);
    setError("");
    try {
      const fresh = await generateThesis(ticker);
      setTheses(fresh);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleToggle(thesis: Thesis) {
    const updated = await updateThesisSelection(ticker, thesis.id, !thesis.selected);
    setTheses((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  async function handleEvaluate() {
    if (selectedCount === 0) {
      setError("Select at least one thesis point before evaluating.");
      return;
    }
    setEvaluating(true);
    setError("");
    try {
      const result = await runEvaluation(ticker);
      setEvaluation(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Evaluation failed");
    } finally {
      setEvaluating(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Actions */}
      <div className="flex gap-3 items-center flex-wrap">
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 rounded border border-zinc-700 transition-colors"
        >
          {generating ? "Generating…" : theses.length ? "Regenerate Thesis" : "Generate Thesis"}
        </button>
        <button
          onClick={handleEvaluate}
          disabled={evaluating || selectedCount === 0}
          className="px-4 py-2 text-sm bg-blue-700 hover:bg-blue-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded transition-colors"
        >
          {evaluating ? "Evaluating…" : `Evaluate (${selectedCount} selected)`}
        </button>
        {error && <p className="text-red-400 text-xs">{error}</p>}
      </div>

      {/* Thesis bullets */}
      {theses.length === 0 ? (
        <p className="text-zinc-600 text-sm">
          No thesis yet. Click &quot;Generate Thesis&quot; to get started.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          <p className="text-zinc-500 text-xs">
            Check the thesis points you believe in. These will be evaluated against current signals.
          </p>
          {CATEGORY_ORDER.map((cat) => {
            const items = groups[cat];
            if (!items || items.length === 0) return null;
            return (
              <div key={cat}>
                <h3 className="text-xs uppercase tracking-widest text-zinc-500 mb-2">
                  {CATEGORY_LABELS[cat] ?? cat}
                </h3>
                <div className="flex flex-col gap-1">
                  {items.map((t) => (
                    <label
                      key={t.id}
                      className={`flex items-start gap-3 px-3 py-2 rounded cursor-pointer transition-colors ${
                        t.selected
                          ? "bg-zinc-800 border border-zinc-600"
                          : "bg-zinc-900 border border-zinc-800 hover:border-zinc-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={t.selected}
                        onChange={() => handleToggle(t)}
                        className="mt-0.5 accent-blue-500 shrink-0"
                      />
                      <span className={`text-sm leading-relaxed ${t.selected ? "text-zinc-100" : "text-zinc-400"}`}>
                        {t.statement}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Evaluation result */}
      {evaluation && (
        <div className="border border-zinc-700 rounded-lg p-5 bg-zinc-900">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl font-mono font-bold text-white">
              {evaluation.score}/100
            </span>
            <StatusBadge status={evaluation.status} />
            <span className="text-zinc-600 text-xs ml-auto">
              {new Date(evaluation.timestamp).toLocaleString()}
            </span>
          </div>

          {evaluation.explanation && (
            <p className="text-sm text-zinc-300 leading-relaxed mb-4 border-l-2 border-zinc-600 pl-3">
              {evaluation.explanation}
            </p>
          )}

          {evaluation.broken_points.length > 0 && (
            <div>
              <h4 className="text-xs uppercase tracking-widest text-zinc-500 mb-3">
                Flagged Points
              </h4>
              <div className="flex flex-col gap-2">
                {evaluation.broken_points.map((bp, i) => (
                  <div key={i} className="bg-red-950 border border-red-900 rounded p-3">
                    <p className="text-zinc-300 text-xs mb-1 italic">&quot;{bp.statement}&quot;</p>
                    <p className="text-red-300 text-xs">{bp.signal}</p>
                    <p className="text-zinc-600 text-xs mt-1">−{bp.deduction} pts</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
