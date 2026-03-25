"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
const GaugeComponent = dynamic(() => import("react-gauge-component"), { ssr: false });
import {
  generateAndEvaluate,
  updateThesisSelection,
  updateThesisStatement,
  updateThesisFrozen,
  deleteThesis,
  runEvaluation,
  type Thesis,
  type Evaluation,
} from "@/lib/api";
import { useAssistant } from "@/app/context/AssistantContext";
import StatusBadge from "@/app/components/StatusBadge";

const CATEGORY_LABELS: Record<string, string> = {
  competitive_moat: "Competitive Moat",
  growth_trajectory: "Growth Trajectory",
  valuation: "Valuation",
  financial_health: "Financial Health",
  ownership_conviction: "Ownership & Conviction",
  risks: "Risks & Bear Case",
};

const CATEGORY_ORDER = [
  "competitive_moat",
  "growth_trajectory",
  "valuation",
  "financial_health",
  "ownership_conviction",
  "risks",
];

const IMPORTANCE_DOTS: Record<string, { color: string; label: string } | null> = {
  standard: null,
  important: { color: "bg-yellow-500", label: "Important" },
  critical: { color: "bg-red-500", label: "Critical" },
};

function groupByCategory(theses: Thesis[]): Record<string, Thesis[]> {
  const groups: Record<string, Thesis[]> = {};
  for (const t of theses) {
    if (!groups[t.category]) groups[t.category] = [];
    groups[t.category].push(t);
  }
  return groups;
}

function sortByImpact(
  items: Thesis[],
  impactMap: Map<number, { type: "confirmed" | "broken"; pts: number }>
): Thesis[] {
  return [...items].sort((a, b) => {
    const ia = impactMap.get(a.id);
    const ib = impactMap.get(b.id);
    const rankA = ia ? (ia.type === "confirmed" ? 0 : 2) : 1;
    const rankB = ib ? (ib.type === "confirmed" ? 0 : 2) : 1;
    if (rankA !== rankB) return rankA - rankB;
    const ptsA = ia?.pts ?? 0;
    const ptsB = ib?.pts ?? 0;
    return ptsB - ptsA;
  });
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
  const [confirmAction, setConfirmAction] = useState<{ type: "edit" | "delete" | "unfreeze"; thesis: Thesis } | null>(null);

  const { setTicker, registerThesisAdded } = useAssistant();

  useEffect(() => {
    setTicker(ticker);
    registerThesisAdded((t) => setTheses((prev) => [...prev, t]));
    return () => {
      setTicker(null);
      registerThesisAdded(null);
    };
  }, [ticker, setTicker, registerThesisAdded]);

  const selectedCount = theses.filter((t) => t.selected).length;
  const allSelected = theses.length > 0 && selectedCount === theses.length;
  const groups = groupByCategory(theses);

  const impactMap = useMemo((): Map<number, { type: "confirmed" | "broken"; pts: number }> => {
    if (!evaluation) return new Map();
    const m = new Map<number, { type: "confirmed" | "broken"; pts: number }>();
    for (const cp of evaluation.confirmed_points) m.set(cp.thesis_id, { type: "confirmed", pts: cp.credit });
    for (const bp of evaluation.broken_points) m.set(bp.thesis_id, { type: "broken", pts: bp.deduction });
    return m;
  }, [evaluation]);

  const frozenBreakIds = useMemo(() => {
    if (!evaluation?.frozen_breaks) return new Set<number>();
    return new Set(evaluation.frozen_breaks.map((fb) => fb.thesis_id));
  }, [evaluation]);

  async function handleGenerate() {
    setGenerating(true);
    setError("");
    try {
      const result = await generateAndEvaluate(ticker);
      setTheses(result.theses);
      if (result.evaluation) {
        setEvaluation(result.evaluation);
      }
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

  const handleSelectAll = useCallback(async () => {
    const newSelected = !allSelected;
    const updates = theses
      .filter((t) => t.selected !== newSelected)
      .map((t) => updateThesisSelection(ticker, t.id, newSelected));
    const results = await Promise.all(updates);
    setTheses((prev) =>
      prev.map((t) => {
        const updated = results.find((r) => r.id === t.id);
        return updated ?? t;
      })
    );
  }, [allSelected, theses, ticker]);

  function handleFreeze(thesis: Thesis) {
    if (thesis.frozen) {
      // Unfreezing requires confirmation
      setConfirmAction({ type: "unfreeze", thesis });
      return;
    }
    doFreeze(thesis);
  }

  async function doFreeze(thesis: Thesis) {
    const updated = await updateThesisFrozen(ticker, thesis.id, !thesis.frozen);
    setTheses((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  function startEdit(t: Thesis) {
    if (t.frozen) {
      setConfirmAction({ type: "edit", thesis: t });
      return;
    }
    setEditingId(t.id);
    setEditDraft(t.statement);
  }

  function confirmEditFrozen() {
    if (!confirmAction || confirmAction.type !== "edit") return;
    setEditingId(confirmAction.thesis.id);
    setEditDraft(confirmAction.thesis.statement);
    setConfirmAction(null);
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

  function requestDelete(t: Thesis) {
    if (t.frozen) {
      setConfirmAction({ type: "delete", thesis: t });
      return;
    }
    handleDeleteThesis(t.id);
  }

  async function confirmDeleteFrozen() {
    if (!confirmAction || confirmAction.type !== "delete") return;
    await handleDeleteThesis(confirmAction.thesis.id);
    setConfirmAction(null);
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
      {/* Frozen break alert banner */}
      {evaluation && evaluation.frozen_breaks && evaluation.frozen_breaks.length > 0 && (
        <div className="bg-red-950 border border-red-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-red-400 text-lg">&#9888;</span>
            <h4 className="text-red-300 text-sm font-bold uppercase tracking-wide">
              Core Conviction Under Pressure
            </h4>
          </div>
          {evaluation.frozen_breaks.map((fb, i) => (
            <div key={i} className="ml-6 mb-1">
              <p className="text-red-200 text-sm">
                <span className="text-red-400 font-mono mr-1">&#9679;</span>
                &quot;{fb.statement}&quot;
                <span className="text-red-400 text-xs ml-2">&mdash; {fb.signal}</span>
              </p>
            </div>
          ))}
        </div>
      )}

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
          {generating ? "Generating & Evaluating..." : theses.length ? "Regenerate Thesis" : "Generate Thesis"}
        </button>
        <button
          onClick={handleEvaluate}
          disabled={evaluating || selectedCount < 3}
          className="px-4 py-2 text-sm bg-blue-700 hover:bg-blue-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded transition-colors"
          title={selectedCount < 3 ? `Select at least 3 points (${selectedCount} selected)` : undefined}
        >
          {evaluating ? "Evaluating..." : `Evaluate (${selectedCount} selected)`}
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
                      <div key={i} className={`rounded p-3 ${
                        frozenBreakIds.has(bp.thesis_id)
                          ? "bg-red-950 border-2 border-red-600"
                          : "bg-red-950 border border-red-900"
                      }`}>
                        <div className="flex items-center gap-1.5">
                          {frozenBreakIds.has(bp.thesis_id) && (
                            <span className="text-red-400 text-xs" title="Frozen conviction point">&#128274;</span>
                          )}
                          <p className="text-zinc-300 text-xs mb-1 italic">&quot;{bp.statement}&quot;</p>
                        </div>
                        <p className="text-red-300 text-xs">{bp.signal}</p>
                        <p className="text-zinc-600 text-xs mt-1">
                          &minus;{bp.deduction} pts
                          {frozenBreakIds.has(bp.thesis_id) && (
                            <span className="text-red-400 ml-1">(2x frozen penalty)</span>
                          )}
                        </p>
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
          {/* Select all + legend */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-zinc-400 text-xs hover:text-zinc-200 transition-colors">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={handleSelectAll}
                className="accent-blue-500 cursor-pointer"
              />
              {allSelected ? "Deselect All" : "Select All"}
            </label>
            <span className="text-zinc-600 text-xs">|</span>
            <span className="text-zinc-500 text-xs">
              <span className="text-zinc-300">{selectedCount}</span> of {theses.length} selected
            </span>
            <span className="text-zinc-600 text-xs">|</span>
            <span className="flex items-center gap-1 text-zinc-500 text-xs">
              <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> Important
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block ml-2" /> Critical
              <span className="text-zinc-500 ml-2">&#128274;</span> Frozen
            </span>
          </div>

          <p className="text-zinc-500 text-xs">
            <span className="text-zinc-300">Checked</span> points are submitted for evaluation.
            Click the lock icon to freeze core conviction points.
            Use <span className="text-zinc-400">Research AI</span> to ask questions or add new points.
          </p>

          {/* Render known categories in order, then any unknown categories from old data */}
          {[...CATEGORY_ORDER, ...Object.keys(groups).filter((c) => !CATEGORY_ORDER.includes(c))].map((cat) => {
            const items = evaluation ? sortByImpact(groups[cat] ?? [], impactMap) : groups[cat];
            if (!items || items.length === 0) return null;
            return (
              <div key={cat}>
                <h3 className="text-xs uppercase tracking-widest text-zinc-500 mb-2">
                  {CATEGORY_LABELS[cat] ?? cat}
                </h3>
                <div className="flex flex-col gap-1">
                  {items.map((t) => {
                    const impact = impactMap.get(t.id);
                    const importanceDot = IMPORTANCE_DOTS[t.importance];
                    const isFrozenBroken = frozenBreakIds.has(t.id);

                    return editingId === t.id ? (
                      /* Edit mode */
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
                      /* Normal row */
                      <div
                        key={t.id}
                        className={`group flex items-start gap-3 px-3 py-2 rounded transition-colors ${
                          isFrozenBroken
                            ? "border-l-2 border-red-500 bg-red-950/40 ring-1 ring-red-800"
                            : impact?.type === "confirmed"
                            ? "border-l-2 border-green-700 bg-green-950/30"
                            : impact?.type === "broken"
                            ? "border-l-2 border-red-700 bg-red-950/30"
                            : t.selected
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

                        {/* Importance dot */}
                        {importanceDot && (
                          <span
                            className={`w-2 h-2 rounded-full ${importanceDot.color} shrink-0 mt-1.5`}
                            title={importanceDot.label}
                          />
                        )}

                        {/* Frozen indicator */}
                        {t.frozen && (
                          <span className="text-yellow-500 text-xs shrink-0 mt-0.5" title="Frozen conviction point">
                            &#128274;
                          </span>
                        )}

                        <span
                          onClick={() => handleToggle(t)}
                          className={`flex-1 text-sm leading-relaxed cursor-pointer ${
                            t.selected ? "text-zinc-100" : "text-zinc-400"
                          }`}
                        >
                          {t.statement}
                        </span>

                        {impact && (
                          <span className={`text-[10px] font-mono font-bold shrink-0 mt-0.5 ${
                            impact.type === "confirmed" ? "text-green-400" : "text-red-400"
                          }`}>
                            {impact.type === "confirmed" ? `+${impact.pts}` : `\u2212${impact.pts}`}
                          </span>
                        )}

                        {/* Freeze / Edit / Delete — visible on row hover */}
                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleFreeze(t); }}
                            title={t.frozen ? "Unfreeze" : "Freeze (core conviction)"}
                            className={`p-1 rounded text-xs leading-none transition-colors ${
                              t.frozen
                                ? "text-yellow-400 hover:text-yellow-200"
                                : "text-zinc-500 hover:text-yellow-400"
                            }`}
                          >
                            {t.frozen ? "\u{1F513}" : "\u{1F512}"}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); startEdit(t); }}
                            title="Edit"
                            className="p-1 text-zinc-500 hover:text-zinc-200 rounded text-xs leading-none transition-colors"
                          >
                            &#x270E;
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); requestDelete(t); }}
                            title="Delete"
                            className="p-1 text-zinc-500 hover:text-red-400 rounded text-xs leading-none transition-colors"
                          >
                            &#x2715;
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Frozen point confirmation dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 max-w-md mx-4 shadow-2xl">
            <h3 className="text-zinc-100 text-sm font-semibold mb-2">
              {confirmAction.type === "delete" ? "Delete Frozen Point?" : "Edit Frozen Point?"}
            </h3>
            <p className="text-zinc-400 text-xs mb-1">
              This is a frozen conviction point:
            </p>
            <p className="text-zinc-300 text-sm mb-4 italic border-l-2 border-yellow-600 pl-3">
              &quot;{confirmAction.thesis.statement}&quot;
            </p>
            <p className="text-zinc-400 text-xs mb-4">
              Frozen points represent core convictions in your thesis.
              {confirmAction.type === "delete"
                ? " Deleting it removes a key part of your investment rationale."
                : " Editing it changes a key part of your investment rationale."}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmAction.type === "delete" ? confirmDeleteFrozen : confirmEditFrozen}
                className="px-4 py-2 text-xs bg-red-700 hover:bg-red-600 text-white rounded transition-colors"
              >
                {confirmAction.type === "delete" ? "Delete Anyway" : "Edit Anyway"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
