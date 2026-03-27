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
  addManualThesis,
  type Thesis,
  type Evaluation,
} from "@/lib/api";
import { useAssistant } from "@/app/context/AssistantContext";
import StatusBadge from "@/app/components/StatusBadge";
import {
  Lock,
  Unlock,
  Pencil,
  X,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Activity,
  Save,
  CircleDot,
  ChevronUp,
  ChevronDown,
  Plus,
  Zap,
  Star,
} from "lucide-react";

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

const IMPORTANCE_ICONS: Record<string, { Icon: typeof Zap; className: string; label: string } | null> = {
  standard: null,
  important: { Icon: Star, className: "w-3.5 h-3.5 text-yellow-400", label: "Important" },
  critical: { Icon: Zap, className: "w-3.5 h-3.5 text-red-400", label: "Critical" },
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
  const [evalCollapsed, setEvalCollapsed] = useState(false);
  const [addForCategory, setAddForCategory] = useState<string | null>(null);
  const [addStatement, setAddStatement] = useState("");
  const [addingManual, setAddingManual] = useState(false);

  const { setTicker, registerThesisAdded, registerEvaluationTriggered } = useAssistant();

  useEffect(() => {
    setTicker(ticker);
    registerThesisAdded((t) => setTheses((prev) => [...prev, t]));
    registerEvaluationTriggered(async () => {
      try {
        const result = await runEvaluation(ticker);
        setEvaluation(result);
        return result;
      } catch {
        return null;
      }
    });
    return () => {
      setTicker(null);
      registerThesisAdded(null);
      registerEvaluationTriggered(null);
    };
  }, [ticker, setTicker, registerThesisAdded, registerEvaluationTriggered]);

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

  async function handleAddManual(e: React.FormEvent) {
    e.preventDefault();
    const stmt = addStatement.trim();
    if (!stmt || stmt.length < 10 || addingManual || !addForCategory) return;
    setAddingManual(true);
    setError("");
    try {
      const added = await addManualThesis(ticker, addForCategory, stmt);
      setTheses((prev) => [...prev, added]);
      setAddStatement("");
      setAddForCategory(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add point");
    } finally {
      setAddingManual(false);
    }
  }

  const lockedCount = theses.filter((t) => t.frozen).length;
  const criticalCount = theses.filter((t) => t.importance === "critical").length;
  const importantCount = theses.filter((t) => t.importance === "important").length;
  const manualCount = theses.filter((t) => t.source === "manual").length;

  const scoreColor = (s: number) => s >= 75 ? "#22c55e" : s >= 50 ? "#eab308" : "#ef4444";
  const scoreLabel = (s: number) => s >= 75 ? "Thesis Strong" : s >= 50 ? "Under Pressure" : "At Risk";

  return (
    <div className="flex flex-col gap-8">
      {/* Frozen break alert banner */}
      {evaluation && evaluation.frozen_breaks && evaluation.frozen_breaks.length > 0 && (
        <div className="bg-red-950/60 border border-red-800 rounded-xl p-4 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <h4 className="text-red-300 text-sm font-bold uppercase tracking-wide">
              Core Conviction Under Pressure
            </h4>
          </div>
          {evaluation.frozen_breaks.map((fb, i) => (
            <div key={i} className="ml-7 mb-1">
              <p className="text-red-200 text-sm">
                <CircleDot className="w-3 h-3 text-red-400 inline mr-1.5" />
                &quot;{fb.statement}&quot;
                <span className="text-red-400 text-xs ml-2">&mdash; {fb.signal}</span>
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Per-stock thesis health gauge */}
      {evaluation && (
        <div className="flex flex-col items-center py-4 bg-surface/80 backdrop-blur-sm border border-zinc-800 rounded-2xl">
          <p className="text-xs uppercase tracking-widest text-zinc-500 mb-1">Thesis Health</p>
          <GaugeComponent
            type="semicircle"
            value={evaluation.score}
            minValue={0}
            maxValue={100}
            arc={{
              subArcs: [
                { limit: 50, color: "#ef4444", tooltip: { text: "At Risk (0\u201350)", style: { fontSize: "12px", backgroundColor: "#18181b", color: "#e4e4e7", border: "1px solid #3f3f46", borderRadius: "8px", padding: "4px 8px" } } },
                { limit: 75, color: "#eab308", tooltip: { text: "Under Pressure (50\u201375)", style: { fontSize: "12px", backgroundColor: "#18181b", color: "#e4e4e7", border: "1px solid #3f3f46", borderRadius: "8px", padding: "4px 8px" } } },
                { limit: 100, color: "#22c55e", tooltip: { text: "Thesis Strong (75\u2013100)", style: { fontSize: "12px", backgroundColor: "#18181b", color: "#e4e4e7", border: "1px solid #3f3f46", borderRadius: "8px", padding: "4px 8px" } } },
              ],
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
          {/* Zone legend */}
          <div className="flex gap-2 mt-2">
            {[
              { color: "#ef4444", label: "At Risk" },
              { color: "#eab308", label: "Pressure" },
              { color: "#22c55e", label: "Strong" },
            ].map((z) => (
              <div key={z.label} className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: z.color }} />
                <span className="text-[8px] text-zinc-500">{z.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 items-center flex-wrap">
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-surface hover:bg-surface-raised disabled:opacity-50 text-zinc-200 rounded-lg border border-zinc-700 transition-colors"
        >
          {generating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {generating ? "Generating & Evaluating..." : theses.length ? "Regenerate Thesis" : "Generate Thesis"}
        </button>
        <button
          onClick={handleEvaluate}
          disabled={evaluating || selectedCount < 3}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-accent hover:bg-accent-hover disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-lg transition-colors"
          title={selectedCount < 3 ? `Select at least 3 points (${selectedCount} selected)` : undefined}
        >
          {evaluating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Activity className="w-4 h-4" />
          )}
          {evaluating ? "Evaluating..." : `Evaluate (${selectedCount} selected)`}
        </button>
        {error && <p className="text-red-400 text-xs">{error}</p>}
      </div>

      {/* Evaluation result — collapsible */}
      {evaluation && (
        <div className="border border-zinc-700 rounded-xl bg-surface overflow-hidden">
          <button
            onClick={() => setEvalCollapsed((c) => !c)}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-surface-raised/30 transition-colors"
          >
            <span className="text-2xl font-mono font-bold text-white">
              {evaluation.score}/100
            </span>
            <StatusBadge status={evaluation.status} />
            <span className="text-zinc-600 text-xs ml-auto mr-2">
              {new Date(evaluation.timestamp).toLocaleString()}
            </span>
            {evalCollapsed
              ? <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
              : <ChevronUp className="w-4 h-4 text-zinc-500 shrink-0" />}
          </button>

          {!evalCollapsed && (
            <div className="px-5 pb-5">
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
                      <div key={i} className="bg-green-950/40 border border-green-900 rounded-lg p-3">
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
                      <div key={i} className={`rounded-lg p-3 ${
                        frozenBreakIds.has(bp.thesis_id)
                          ? "bg-red-950/50 border-2 border-red-600"
                          : "bg-red-950/40 border border-red-900"
                      }`}>
                        <div className="flex items-center gap-1.5">
                          {frozenBreakIds.has(bp.thesis_id) && (
                            <Lock className="w-3 h-3 text-red-400 shrink-0" />
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
        </div>
      )}

      {/* Thesis bullets */}
      {theses.length === 0 ? (
        <p className="text-zinc-600 text-sm">
          No thesis yet. Click &quot;Generate Thesis&quot; to get started.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Select all + counts + add point */}
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer text-zinc-400 text-xs hover:text-zinc-200 transition-colors">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={handleSelectAll}
                className="cursor-pointer"
              />
              {allSelected ? "Deselect All" : "Select All"}
            </label>
            <span className="text-zinc-700 text-xs">|</span>
            <span className="text-zinc-500 text-xs">
              <span className="text-zinc-300">{selectedCount}</span>/{theses.length} selected
            </span>

            {/* Counts */}
            <div className="flex items-center gap-3 text-[11px] text-zinc-500">
              {lockedCount > 0 && (
                <span className="flex items-center gap-1">
                  <Lock className="w-3 h-3 text-yellow-500" /> {lockedCount} locked
                </span>
              )}
              {criticalCount > 0 && (
                <span className="flex items-center gap-1">
                  <Zap className="w-3 h-3 text-red-400" /> {criticalCount} critical
                </span>
              )}
              {importantCount > 0 && (
                <span className="flex items-center gap-1">
                  <Star className="w-3 h-3 text-yellow-400" /> {importantCount} important
                </span>
              )}
              {manualCount > 0 && (
                <span className="text-zinc-500">{manualCount} manual</span>
              )}
            </div>
          </div>

          <p className="text-zinc-500 text-xs">
            <span className="text-zinc-300">Checked</span> points are submitted for evaluation.
            Locked and manual points are preserved on regeneration.
          </p>

          {/* Render known categories in order, then any unknown categories from old data */}
          {[...CATEGORY_ORDER, ...Object.keys(groups).filter((c) => !CATEGORY_ORDER.includes(c))].map((cat) => {
            const items = evaluation ? sortByImpact(groups[cat] ?? [], impactMap) : groups[cat];
            if (!items || items.length === 0) return null;
            return (
              <div key={cat}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs uppercase tracking-widest text-zinc-500 font-medium">
                    {CATEGORY_LABELS[cat] ?? cat}
                  </h3>
                  <button
                    onClick={() => setAddForCategory(addForCategory === cat ? null : cat)}
                    className="p-0.5 text-zinc-600 hover:text-accent transition-colors rounded"
                    title={`Add point to ${CATEGORY_LABELS[cat] ?? cat}`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Per-section inline add form */}
                {addForCategory === cat && (
                  <form onSubmit={handleAddManual} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={addStatement}
                      onChange={(e) => setAddStatement(e.target.value)}
                      placeholder="Enter thesis point (min 10 chars)..."
                      autoFocus
                      className="flex-1 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
                    />
                    <button
                      type="submit"
                      disabled={addingManual || addStatement.trim().length < 10}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs bg-accent hover:bg-accent-hover disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-lg transition-colors shrink-0"
                    >
                      {addingManual ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAddForCategory(null); setAddStatement(""); }}
                      className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </form>
                )}

                <div className="flex flex-col gap-1">
                  {items.map((t) => {
                    const impact = impactMap.get(t.id);
                    const importanceIcon = IMPORTANCE_ICONS[t.importance];
                    const isFrozenBroken = frozenBreakIds.has(t.id);
                    const isNeutral = evaluation && t.selected && !impactMap.has(t.id);

                    return editingId === t.id ? (
                      /* Edit mode */
                      <div
                        key={t.id}
                        className="flex flex-col gap-2 px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-600"
                      >
                        <textarea
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          rows={3}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white resize-none focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveEdit(t.id)}
                            className="flex items-center gap-1 px-3 py-1 text-xs bg-accent hover:bg-accent-hover text-white rounded-md transition-colors"
                          >
                            <Save className="w-3 h-3" />
                            Save
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="flex items-center gap-1 px-3 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-md transition-colors"
                          >
                            <X className="w-3 h-3" />
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Normal row */
                      <div
                        key={t.id}
                        className={`group flex items-start gap-3 px-3 py-2 rounded-lg transition-all ${
                          isFrozenBroken
                            ? "border-l-2 border-red-500 bg-red-950/40 ring-1 ring-red-800"
                            : impact?.type === "confirmed"
                            ? "border-l-2 border-green-700 bg-green-950/30"
                            : impact?.type === "broken"
                            ? "border-l-2 border-red-700 bg-red-950/30"
                            : isNeutral
                            ? "border border-dashed border-zinc-600 bg-surface"
                            : t.selected
                            ? "bg-surface-raised/50 border border-zinc-600"
                            : "bg-surface border border-zinc-800 hover:border-zinc-700"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={t.selected}
                          onChange={() => handleToggle(t)}
                          className="mt-0.5 shrink-0 cursor-pointer"
                        />

                        {/* Importance icon */}
                        {importanceIcon && (
                          <span title={importanceIcon.label} className="shrink-0 mt-0.5">
                            <importanceIcon.Icon className={importanceIcon.className} />
                          </span>
                        )}

                        {/* Frozen indicator */}
                        {t.frozen && (
                          <Lock className="w-3.5 h-3.5 text-yellow-500 shrink-0 mt-0.5" />
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
                            className={`p-1 rounded transition-colors ${
                              t.frozen
                                ? "text-yellow-400 hover:text-yellow-200"
                                : "text-zinc-500 hover:text-yellow-400"
                            }`}
                          >
                            {t.frozen ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); startEdit(t); }}
                            title="Edit"
                            className="p-1 text-zinc-500 hover:text-zinc-200 rounded transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); requestDelete(t); }}
                            title="Delete"
                            className="p-1 text-zinc-500 hover:text-red-400 rounded transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-zinc-700 rounded-2xl p-6 max-w-md mx-4 shadow-2xl">
            <h3 className="text-zinc-100 text-sm font-semibold mb-2">
              {confirmAction.type === "delete"
                ? "Delete Frozen Point?"
                : confirmAction.type === "unfreeze"
                  ? "Unfreeze Conviction Point?"
                  : "Edit Frozen Point?"}
            </h3>
            <p className="text-zinc-400 text-xs mb-1">
              This is a frozen conviction point:
            </p>
            <p className="text-zinc-300 text-sm mb-4 italic border-l-2 border-yellow-600 pl-3">
              &quot;{confirmAction.thesis.statement}&quot;
            </p>
            <p className="text-zinc-400 text-xs mb-4">
              {confirmAction.type === "delete"
                ? "Frozen points represent core convictions in your thesis. Deleting it removes a key part of your investment rationale."
                : confirmAction.type === "unfreeze"
                  ? "Unfreezing removes conviction protection from this point. It will no longer receive 2x weight in evaluations or trigger frozen-break alerts."
                  : "Frozen points represent core convictions in your thesis. Editing it changes a key part of your investment rationale."}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={
                  confirmAction.type === "delete"
                    ? confirmDeleteFrozen
                    : confirmAction.type === "unfreeze"
                      ? () => { doFreeze(confirmAction.thesis); setConfirmAction(null); }
                      : confirmEditFrozen
                }
                className={`px-4 py-2 text-xs text-white rounded-lg transition-colors ${
                  confirmAction.type === "unfreeze"
                    ? "bg-yellow-700 hover:bg-yellow-600"
                    : "bg-red-700 hover:bg-red-600"
                }`}
              >
                {confirmAction.type === "delete"
                  ? "Delete Anyway"
                  : confirmAction.type === "unfreeze"
                    ? "Unfreeze"
                    : "Edit Anyway"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
