"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
const GaugeComponent = dynamic(() => import("react-gauge-component"), { ssr: false });
import {
  generateThesis,
  updateThesisSelection,
  updateThesisStatement,
  deleteThesis,
  runEvaluation,
  type Thesis,
  type Evaluation,
} from "@/lib/api";
import { useAssistant } from "@/app/context/AssistantContext";
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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const { setTicker, registerThesisAdded } = useAssistant();

  // Sync active ticker into context so AssistantPanel knows which stock is open
  useEffect(() => {
    setTicker(ticker);
    registerThesisAdded((t) => setTheses((prev) => [...prev, t]));
    return () => {
      setTicker(null);
      registerThesisAdded(null);
    };
  }, [ticker, setTicker, registerThesisAdded]);

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

  function startEdit(t: Thesis) {
    setEditingId(t.id);
    setEditDraft(t.statement);
  }

  async function handleSaveEdit(id: number) {
    try {
      const updated = await updateThesisStatement(ticker, id, editDraft);
      setTheses((prev) => prev.map((t) => (t.id === id ? updated : t)));
      setEditingId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Edit failed");
    }
  }

  async function handleDeleteThesis(id: number) {
    try {
      await deleteThesis(ticker, id);
      setTheses((prev) => prev.filter((t) => t.id !== id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function handleEvaluate() {
    if (selectedCount < 3) {
      setError(`Select at least 3 thesis points before evaluating (${selectedCount} selected).`);
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

  const scoreColor = (s: number) => s >= 75 ? "#22c55e" : s >= 50 ? "#eab308" : "#ef4444";
  const scoreLabel = (s: number) => s >= 75 ? "Thesis Strong" : s >= 50 ? "Under Pressure" : "At Risk";

  return (
    <div className="flex flex-col gap-8">
      {/* Per-stock thesis health gauge */}
      {evaluation && (
        <div className="flex flex-col items-center py-4 bg-zinc-900 border border-zinc-800 rounded-xl">
          <p className="text-xs uppercase tracking-widest text-zinc-500 mb-1">Thesis Health</p>
          <GaugeComponent
            type="semicircle"
            value={evaluation.score}
            minValue={0}
            maxValue={100}
            arc={{
              colorArray: ["#ef4444", "#eab308", "#22c55e"],
              subArcs: [{ limit: 50 }, { limit: 75 }, { limit: 100 }],
              padding: 0.02,
              width: 0.25,
            }}
            pointer={{ color: scoreColor(evaluation.score), animationDelay: 0 }}
            labels={{ valueLabel: { hide: true }, tickLabels: { hideMinMax: true, ticks: [] } }}
            style={{ width: "100%", maxWidth: "200px" }}
          />
          <div className="text-center -mt-2">
            <span className="text-3xl font-mono font-bold text-white">{evaluation.score}</span>
            <span className="text-zinc-500 text-xs ml-1">/100</span>
            <p className="text-xs mt-0.5 font-semibold tracking-wide" style={{ color: scoreColor(evaluation.score) }}>
              {scoreLabel(evaluation.score)}
            </p>
            <p className="text-zinc-600 text-xs mt-0.5">
              {new Date(evaluation.timestamp).toLocaleDateString()}
            </p>
          </div>
        </div>
      )}

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
          disabled={evaluating || selectedCount < 3}
          className="px-4 py-2 text-sm bg-blue-700 hover:bg-blue-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded transition-colors"
          title={selectedCount < 3 ? `Select at least 3 points (${selectedCount} selected)` : undefined}
        >
          {evaluating ? "Evaluating…" : `Evaluate (${selectedCount} selected)`}
        </button>
        {error && <p className="text-red-400 text-xs">{error}</p>}
      </div>

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

          {(evaluation.confirmed_points.length > 0 || evaluation.broken_points.length > 0) && (
            <div className="flex flex-col gap-4">
              {evaluation.confirmed_points.length > 0 && (
                <div>
                  <h4 className="text-xs uppercase tracking-widest text-zinc-500 mb-2">
                    Confirmed Points
                  </h4>
                  <div className="flex flex-col gap-2">
                    {evaluation.confirmed_points.map((cp, i) => (
                      <div key={i} className="bg-green-950 border border-green-900 rounded p-3">
                        <p className="text-zinc-300 text-xs mb-1 italic">&quot;{cp.statement}&quot;</p>
                        <p className="text-green-300 text-xs">{cp.signal}</p>
                        <p className="text-zinc-600 text-xs mt-1">+{cp.credit} pts</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {evaluation.broken_points.length > 0 && (
                <div>
                  <h4 className="text-xs uppercase tracking-widest text-zinc-500 mb-2">
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
      )}

      {/* Thesis bullets */}
      {theses.length === 0 ? (
        <p className="text-zinc-600 text-sm">
          No thesis yet. Click &quot;Generate Thesis&quot; to get started.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          <p className="text-zinc-500 text-xs">
            <span className="text-zinc-300">Checked</span> points are submitted for evaluation and affect your score.
            Unchecked points stay in your pool — re-check them any time.
            Hover a point to edit or delete it. Use <span className="text-zinc-400">Research AI</span> to ask questions or add new points.
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
                  {items.map((t) =>
                    editingId === t.id ? (
                      /* ── Edit mode ── */
                      <div
                        key={t.id}
                        className="flex flex-col gap-2 px-3 py-2 rounded bg-zinc-800 border border-zinc-600"
                      >
                        <textarea
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          rows={3}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-white resize-none focus:outline-none focus:border-blue-500"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveEdit(t.id)}
                            className="px-3 py-1 text-xs bg-blue-700 hover:bg-blue-600 text-white rounded transition-colors"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-3 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ── Normal row ── */
                      <div
                        key={t.id}
                        className={`group flex items-start gap-3 px-3 py-2 rounded transition-colors ${
                          t.selected
                            ? "bg-zinc-800 border border-zinc-600"
                            : "bg-zinc-900 border border-zinc-800 hover:border-zinc-700"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={t.selected}
                          onChange={() => handleToggle(t)}
                          className="mt-0.5 accent-blue-500 shrink-0 cursor-pointer"
                        />
                        <span
                          onClick={() => handleToggle(t)}
                          className={`flex-1 text-sm leading-relaxed cursor-pointer ${
                            t.selected ? "text-zinc-100" : "text-zinc-400"
                          }`}
                        >
                          {t.statement}
                        </span>
                        {/* Edit / delete — visible on row hover */}
                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); startEdit(t); }}
                            title="Edit"
                            className="p-1 text-zinc-500 hover:text-zinc-200 rounded text-xs leading-none transition-colors"
                          >
                            ✎
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteThesis(t.id); }}
                            title="Delete"
                            className="p-1 text-zinc-500 hover:text-red-400 rounded text-xs leading-none transition-colors"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
