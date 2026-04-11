"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
const GaugeComponent = dynamic(() => import("react-gauge-component"), { ssr: false });
import {
  generateAndEvaluate, previewThesis, confirmPreview as confirmPreview_api,
  updateThesisConviction, updateThesisStatement,
  updateThesisFrozen, deleteThesis, runEvaluation, addManualThesis, getShareToken, reorderTheses, getThesisAudit,
  type Thesis, type Evaluation, type ThesisPreview,
} from "@/lib/api";
import { useAssistant } from "@/app/context/AssistantContext";
import { usePortfolio } from "@/app/context/PortfolioContext";
import StatusBadge from "@/app/components/StatusBadge";
import ThesisTemplateSelector from "@/app/components/ThesisTemplateSelector";
import {
  Lock, Unlock, Pencil, X, AlertTriangle, Loader2, RefreshCw,
  Activity, Save, CircleDot, ChevronUp, ChevronDown, Plus,
  Zap, Star, ThumbsUp, ThumbsDown, Check, Download, Share2,
  Info, History,
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
  "competitive_moat", "growth_trajectory", "valuation",
  "financial_health", "ownership_conviction", "risks",
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
    return (ib?.pts ?? 0) - (ia?.pts ?? 0);
  });
}

interface Props {
  ticker: string;
  initialTheses: Thesis[];
  initialEvaluation: Evaluation | null;
  onEvaluationComplete?: () => void;
}

export default function ThesisManager({ ticker, initialTheses, initialEvaluation, onEvaluationComplete }: Props) {
  const [theses, setTheses] = useState<Thesis[]>(initialTheses);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(initialEvaluation);
  const [generating, setGenerating] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  // Only confirm for: delete-frozen, edit-frozen, unfreeze
  const [confirmAction, setConfirmAction] = useState<{ type: "edit" | "delete" | "unfreeze"; thesis: Thesis } | null>(null);
  const [evalCollapsed, setEvalCollapsed] = useState(false);
  const [addForCategory, setAddForCategory] = useState<string | null>(null);
  const [addStatement, setAddStatement] = useState("");
  const [addingManual, setAddingManual] = useState(false);
  const [previewPoints, setPreviewPoints] = useState<ThesisPreview[] | null>(null);
  const [rejectedIndexes, setRejectedIndexes] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterConviction, setFilterConviction] = useState<string>("all");
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLog, setAuditLog] = useState<import("@/lib/api").ThesisAuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const { setTicker, registerThesisAdded, registerEvaluationTriggered, registerPrefillThesisPoint, fireExplainThesisPoint, togglePanel, isOpen } = useAssistant();
  const { activePortfolioId: pid } = usePortfolio();

  useEffect(() => {
    setTicker(ticker);
    registerThesisAdded((t) => setTheses((prev) => [...prev, t]));
    registerEvaluationTriggered(async () => {
      try {
        const result = await runEvaluation(ticker, pid);
        setEvaluation(result);
        onEvaluationComplete?.();
        return result;
      } catch { return null; }
    });
    registerPrefillThesisPoint((statement) => {
      setAddForCategory("risks");
      setAddStatement(statement);
    });
    return () => {
      setTicker(null);
      registerThesisAdded(null);
      registerEvaluationTriggered(null);
      registerPrefillThesisPoint(null);
    };
  }, [ticker, setTicker, registerThesisAdded, registerEvaluationTriggered, registerPrefillThesisPoint]);

  const likedCount = theses.filter((t) => t.conviction === "liked").length;
  const dislikedCount = theses.filter((t) => t.conviction === "disliked").length;
  const lockedCount = theses.filter((t) => t.frozen).length;
  const selectedCount = theses.filter((t) => t.selected).length;

  const filteredTheses = theses.filter((t) => {
    if (filterCategory !== "all" && t.category !== filterCategory) return false;
    if (filterConviction === "liked" && t.conviction !== "liked") return false;
    if (filterConviction === "disliked" && t.conviction !== "disliked") return false;
    if (filterConviction === "locked" && !t.frozen) return false;
    if (filterConviction === "critical" && t.importance !== "critical") return false;
    return true;
  });
  const groups = groupByCategory(filteredTheses);

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
    setGenerating(true); setError("");
    try {
      const preview = await previewThesis(ticker, pid);
      setPreviewPoints(preview);
      setRejectedIndexes(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally { setGenerating(false); }
  }

  async function confirmPreview() {
    if (!previewPoints) return;
    setConfirming(true); setError("");
    try {
      const approved = previewPoints.filter((_, i) => !rejectedIndexes.has(i));
      const result = await confirmPreview_api(ticker, approved, pid);
      setTheses(result.theses);
      if (result.evaluation) setEvaluation(result.evaluation);
      setPreviewPoints(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally { setConfirming(false); }
  }

  async function handleConviction(thesis: Thesis, value: "liked" | "disliked") {
    const next = thesis.conviction === value ? null : value;
    setTheses((prev) => prev.map((t) => t.id === thesis.id ? { ...t, conviction: next } : t));
    try {
      const updated = await updateThesisConviction(ticker, thesis.id, next, pid);
      setTheses((prev) => prev.map((t) => t.id === updated.id ? updated : t));
    } catch {
      setTheses((prev) => prev.map((t) => t.id === thesis.id ? { ...t, conviction: thesis.conviction } : t));
    }
  }

  async function handleFreeze(thesis: Thesis) {
    if (thesis.frozen) {
      // Unlocking needs confirmation
      setConfirmAction({ type: "unfreeze", thesis });
    } else {
      // Locking — no popup, just do it
      const updated = await updateThesisFrozen(ticker, thesis.id, true, pid);
      setTheses((prev) => prev.map((t) => t.id === updated.id ? updated : t));
    }
  }

  async function doUnfreeze(thesis: Thesis) {
    const updated = await updateThesisFrozen(ticker, thesis.id, false, pid);
    setTheses((prev) => prev.map((t) => t.id === updated.id ? updated : t));
  }

  function startEdit(t: Thesis) {
    if (t.frozen) { setConfirmAction({ type: "edit", thesis: t }); return; }
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
      const updated = await updateThesisStatement(ticker, id, editDraft, pid);
      setTheses((prev) => prev.map((t) => t.id === id ? updated : t));
      setEditingId(null);
    } catch (err) { setError(err instanceof Error ? err.message : "Edit failed"); }
  }

  function requestDelete(t: Thesis) {
    if (t.frozen) { setConfirmAction({ type: "delete", thesis: t }); return; }
    handleDeleteThesis(t.id);
  }

  async function confirmDeleteFrozen() {
    if (!confirmAction || confirmAction.type !== "delete") return;
    await handleDeleteThesis(confirmAction.thesis.id);
    setConfirmAction(null);
  }

  async function handleDeleteThesis(id: number) {
    try {
      await deleteThesis(ticker, id, pid);
      setTheses((prev) => prev.filter((t) => t.id !== id));
    } catch (err) { setError(err instanceof Error ? err.message : "Delete failed"); }
  }

  async function handleEvaluate() {
    if (selectedCount < 3) { setError(`Select at least 3 thesis points (${selectedCount} available).`); return; }
    setEvaluating(true); setError("");
    try {
      const result = await runEvaluation(ticker, pid);
      setEvaluation(result);
      onEvaluationComplete?.();
    } catch (err) { setError(err instanceof Error ? err.message : "Evaluation failed"); }
    finally { setEvaluating(false); }
  }

  async function handleAddManual(e: React.FormEvent) {
    e.preventDefault();
    const stmt = addStatement.trim();
    if (!stmt || stmt.length < 10 || addingManual || !addForCategory) return;
    setAddingManual(true); setError("");
    try {
      const added = await addManualThesis(ticker, addForCategory, stmt, pid);
      setTheses((prev) => [...prev, added]);
      setAddStatement(""); setAddForCategory(null);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to add point"); }
    finally { setAddingManual(false); }
  }

  function exportMarkdown() {
    const lines: string[] = [`# ${ticker} Investment Thesis\n`];
    lines.push(`_Exported ${new Date().toLocaleDateString()}_\n`);

    if (evaluation) {
      const statusLabel = evaluation.score >= 75 ? "Strong" : evaluation.score >= 50 ? "Under Pressure" : "At Risk";
      lines.push(`## Thesis Health: ${evaluation.score}/100 — ${statusLabel}\n`);
      if (evaluation.explanation) lines.push(`> ${evaluation.explanation}\n`);
    }

    for (const cat of [...CATEGORY_ORDER, ...Object.keys(groupByCategory(theses)).filter((c) => !CATEGORY_ORDER.includes(c))]) {
      const items = theses.filter((t) => t.category === cat);
      if (!items.length) continue;
      lines.push(`## ${CATEGORY_LABELS[cat] ?? cat}\n`);
      for (const t of items) {
        const tags = [];
        if (t.importance !== "standard") tags.push(t.importance.toUpperCase());
        if (t.frozen) tags.push("LOCKED");
        if (t.conviction === "liked") tags.push("LIKED");
        if (t.conviction === "disliked") tags.push("DISLIKED");
        const tagStr = tags.length ? ` \`${tags.join(" · ")}\`` : "";
        lines.push(`- ${t.statement}${tagStr}`);
      }
      lines.push("");
    }

    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${ticker}_thesis.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function moveThesis(thesis: Thesis, direction: "up" | "down") {
    const cat = thesis.category;
    const inCat = [...theses]
      .filter((t) => t.category === cat)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const idx = inCat.findIndex((t) => t.id === thesis.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= inCat.length) return;

    const updated = inCat.map((t, i) => {
      if (i === idx) return { ...t, sort_order: inCat[swapIdx].sort_order ?? swapIdx };
      if (i === swapIdx) return { ...t, sort_order: inCat[idx].sort_order ?? idx };
      return t;
    });
    // Normalise to 0-based
    const normalised = updated.map((t, i) => ({ ...t, sort_order: i }));
    setTheses((prev) => prev.map((t) => {
      const n = normalised.find((x) => x.id === t.id);
      return n ?? t;
    }));
    reorderTheses(ticker, normalised.map((t) => ({ id: t.id, sort_order: t.sort_order })), pid).catch(() => {});
  }

  async function handleShare() {
    try {
      const { token } = await getShareToken(ticker, pid);
      const url = `${window.location.origin}/share/${token}`;
      setShareLink(url);
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch { /* ignore */ }
  }

  const scoreColor = (s: number) => s >= 75 ? "#22c55e" : s >= 50 ? "#eab308" : "#ef4444";
  const scoreLabel = (s: number) => s >= 75 ? "Thesis Strong" : s >= 50 ? "Under Pressure" : "At Risk";

  return (
    <div className="flex flex-col gap-6">
      {/* Frozen break alert */}
      {evaluation?.frozen_breaks && evaluation.frozen_breaks.length > 0 && (
        <div className="bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-red-500 dark:text-red-400" />
            <h4 className="text-red-700 dark:text-red-300 text-sm font-bold uppercase tracking-wide">
              Core Conviction Under Pressure
            </h4>
          </div>
          {evaluation.frozen_breaks.map((fb, i) => (
            <div key={i} className="ml-7 mb-1">
              <p className="text-red-600 dark:text-red-200 text-sm">
                <CircleDot className="w-3 h-3 text-red-400 inline mr-1.5" />
                &quot;{fb.statement}&quot;
                <span className="text-red-400 text-xs ml-2">— {fb.signal}</span>
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Thesis health gauge */}
      {evaluation && (
        <div className="flex flex-col items-center py-4 bg-white dark:bg-zinc-800/50 border border-gray-200 dark:border-zinc-700 rounded-2xl">
          <div className="flex items-center gap-1.5 mb-1">
            <p className="text-xs uppercase tracking-widest text-gray-400 dark:text-zinc-500">Thesis Health</p>
            <span
              title="Score = base 50 pts + confirmed signals (+credit each) − broken signals (−deduction each). Locked points get 2× weight. Liked/disliked points amplify by 20%. Final score clamped 0–100."
              className="w-3.5 h-3.5 rounded-full bg-gray-200 dark:bg-zinc-700 text-gray-500 dark:text-zinc-400 text-[9px] font-bold flex items-center justify-center cursor-help shrink-0"
            >?</span>
          </div>
          <GaugeComponent
            type="semicircle"
            value={evaluation.score}
            minValue={0}
            maxValue={100}
            arc={{
              subArcs: [
                { limit: 50, color: "#ef4444" },
                { limit: 75, color: "#eab308" },
                { limit: 100, color: "#22c55e" },
              ],
              padding: 0.02,
              width: 0.25,
            }}
            pointer={{ color: scoreColor(evaluation.score), animationDelay: 0 }}
            labels={{ valueLabel: { hide: true }, tickLabels: { hideMinMax: true, ticks: [] } }}
            style={{ width: "100%", maxWidth: "280px" }}
          />
          <div className="text-center -mt-2">
            <span className="text-3xl font-mono font-bold text-gray-900 dark:text-white">{evaluation.score}</span>
            <span className="text-gray-400 dark:text-zinc-500 text-xs ml-1">/100</span>
            <p className="text-xs mt-0.5 font-semibold tracking-wide" style={{ color: scoreColor(evaluation.score) }}>
              {scoreLabel(evaluation.score)}
            </p>
          </div>
        </div>
      )}

      {/* Preview modal */}
      {previewPoints && (
        <div className="border border-blue-200 dark:border-blue-800 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Review Generated Points</h3>
            <span className="text-xs text-gray-400 dark:text-zinc-500">{previewPoints.length - rejectedIndexes.size} of {previewPoints.length} selected</span>
          </div>
          <p className="text-[11px] text-blue-600 dark:text-blue-400 leading-snug">
            Uncheck any point you disagree with or find too generic. A strong thesis is one you can genuinely defend — edit or add your own after confirming.
          </p>
          <div className="flex flex-col gap-2">
            {previewPoints.map((p, i) => {
              const rejected = rejectedIndexes.has(i);
              return (
                <div
                  key={i}
                  onClick={() => setRejectedIndexes((prev) => {
                    const next = new Set(prev);
                    if (next.has(i)) next.delete(i); else next.add(i);
                    return next;
                  })}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    rejected
                      ? "bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 opacity-40"
                      : "bg-white dark:bg-zinc-800 border-blue-300 dark:border-blue-700"
                  }`}
                >
                  <div className={`mt-0.5 w-4 h-4 rounded border shrink-0 flex items-center justify-center ${
                    rejected ? "border-gray-300 dark:border-zinc-600" : "bg-blue-500 border-blue-500"
                  }`}>
                    {!rejected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-zinc-500">
                      {CATEGORY_LABELS[p.category] ?? p.category}
                    </span>
                    <p className="text-sm text-gray-800 dark:text-zinc-200 mt-0.5">{p.statement}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-2">
            <button onClick={confirmPreview} disabled={confirming || rejectedIndexes.size === previewPoints.length}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg transition-colors">
              {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {confirming ? "Saving…" : "Add to Thesis"}
            </button>
            <button onClick={() => setPreviewPoints(null)}
              className="px-4 py-2 text-sm text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-200 rounded-lg border border-gray-200 dark:border-zinc-700 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 items-center flex-wrap">
        <button onClick={handleGenerate} disabled={generating || !!previewPoints}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-white dark:bg-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-700 disabled:opacity-50 text-gray-700 dark:text-zinc-200 rounded-lg border border-gray-200 dark:border-zinc-700 transition-colors">
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {generating ? "Generating…" : theses.length ? "Regenerate Thesis" : "Generate Thesis"}
        </button>
        <button onClick={handleEvaluate} disabled={evaluating || selectedCount < 3}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-accent hover:bg-accent-hover disabled:bg-gray-100 dark:disabled:bg-zinc-800 disabled:text-gray-400 dark:disabled:text-zinc-600 text-white rounded-lg transition-colors"
          title={selectedCount < 3 ? `Need at least 3 thesis points (${selectedCount} available)` : undefined}>
          {evaluating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
          {evaluating ? "Evaluating…" : "Evaluate Thesis"}
        </button>
        {theses.length > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={handleShare}
              title="Copy shareable link"
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200 rounded-lg border border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors">
              <Share2 className="w-4 h-4" />
              {shareCopied ? "Copied!" : "Share"}
            </button>
            <button onClick={exportMarkdown}
              title="Export thesis as Markdown"
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200 rounded-lg border border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors">
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        )}
        {error && <p className="text-red-500 dark:text-red-400 text-xs">{error}</p>}
      </div>

      {/* Evaluation result */}
      {evaluation && (
        <div className="border border-gray-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800/40 overflow-hidden">
          <button
            onClick={() => setEvalCollapsed((c) => !c)}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 dark:hover:bg-zinc-700/30 transition-colors"
          >
            <span className="text-2xl font-mono font-bold text-gray-900 dark:text-white">{evaluation.score}/100</span>
            <StatusBadge status={evaluation.status} />
            <span className="text-gray-400 dark:text-zinc-600 text-xs ml-auto mr-2">
              {new Date(evaluation.timestamp).toLocaleString()}
            </span>
            {evalCollapsed
              ? <ChevronDown className="w-4 h-4 text-gray-400 dark:text-zinc-500 shrink-0" />
              : <ChevronUp className="w-4 h-4 text-gray-400 dark:text-zinc-500 shrink-0" />}
          </button>

          {!evalCollapsed && (
            <div className="px-5 pb-5">
              {evaluation.explanation && (
                <p className="text-sm text-gray-600 dark:text-zinc-300 leading-relaxed mb-4 border-l-2 border-gray-300 dark:border-zinc-600 pl-3">
                  {evaluation.explanation}
                </p>
              )}
              {(evaluation.confirmed_points.length > 0 || evaluation.broken_points.length > 0) && (
                <div className="flex flex-col gap-4">
                  {evaluation.confirmed_points.length > 0 && (
                    <div>
                      <h4 className="text-xs uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-2">Confirmed Points</h4>
                      <div className="flex flex-col gap-2">
                        {evaluation.confirmed_points.map((cp, i) => (
                          <div key={i} className="bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-900 rounded-lg p-3">
                            <p className="text-gray-700 dark:text-zinc-300 text-xs mb-1 italic">&quot;{cp.statement}&quot;</p>
                            <p className="text-green-600 dark:text-green-300 text-xs">{cp.signal}</p>
                            <p className="text-gray-400 dark:text-zinc-600 text-xs mt-1">+{cp.credit} pts</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {evaluation.broken_points.length > 0 && (
                    <div>
                      <h4 className="text-xs uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-2">Flagged Points</h4>
                      <div className="flex flex-col gap-2">
                        {evaluation.broken_points.map((bp, i) => (
                          <div key={i} className={`rounded-lg p-3 ${
                            frozenBreakIds.has(bp.thesis_id)
                              ? "bg-red-50 dark:bg-red-950/50 border-2 border-red-400 dark:border-red-600"
                              : "bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900"
                          }`}>
                            <div className="flex items-center gap-1.5">
                              {frozenBreakIds.has(bp.thesis_id) && <Lock className="w-3 h-3 text-red-500 dark:text-red-400 shrink-0" />}
                              <p className="text-gray-700 dark:text-zinc-300 text-xs mb-1 italic">&quot;{bp.statement}&quot;</p>
                            </div>
                            <p className="text-red-600 dark:text-red-300 text-xs">{bp.signal}</p>
                            <p className="text-gray-400 dark:text-zinc-600 text-xs mt-1">
                              &minus;{bp.deduction} pts
                              {frozenBreakIds.has(bp.thesis_id) && <span className="text-red-500 ml-1">(2× locked penalty)</span>}
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

      {/* Filter bar */}
      {theses.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 focus:outline-none focus:border-accent"
          >
            <option value="all">All categories</option>
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
          <select
            value={filterConviction}
            onChange={(e) => setFilterConviction(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 focus:outline-none focus:border-accent"
          >
            <option value="all">All types</option>
            <option value="liked">Liked</option>
            <option value="disliked">Disliked</option>
            <option value="locked">Locked</option>
            <option value="critical">Critical</option>
          </select>
          {(filterCategory !== "all" || filterConviction !== "all") && (
            <button
              onClick={() => { setFilterCategory("all"); setFilterConviction("all"); }}
              className="text-xs text-accent hover:text-accent-hover transition-colors"
            >
              Clear filters
            </button>
          )}
          {(filterCategory !== "all" || filterConviction !== "all") && (
            <span className="text-xs text-gray-400 dark:text-zinc-500 ml-auto">
              {filteredTheses.length} of {theses.length}
            </span>
          )}
        </div>
      )}

      {/* Thesis bullets */}
      {theses.length === 0 ? (
        <ThesisTemplateSelector
          ticker={ticker}
          onSelect={(pt) => {
            setAddForCategory(pt.category);
            setAddStatement(pt.statement);
          }}
        />
      ) : filteredTheses.length === 0 ? (
        <p className="text-gray-400 dark:text-zinc-600 text-sm">No points match the current filter.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Conviction summary */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-3 text-[11px]">
              {likedCount > 0 && (
                <span className="flex items-center gap-1 text-green-600 dark:text-green-500">
                  <ThumbsUp className="w-3 h-3" /> {likedCount} liked
                </span>
              )}
              {dislikedCount > 0 && (
                <span className="flex items-center gap-1 text-red-500">
                  <ThumbsDown className="w-3 h-3" /> {dislikedCount} disliked
                </span>
              )}
              {lockedCount > 0 && (
                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-500">
                  <Lock className="w-3 h-3" /> {lockedCount} locked
                </span>
              )}
            </div>
            <span className="text-gray-400 dark:text-zinc-500 text-[11px] ml-auto">{theses.length} points total</span>
          </div>

          <p className="text-gray-400 dark:text-zinc-500 text-xs">
            <span className="text-gray-700 dark:text-zinc-300">Like</span> or <span className="text-gray-700 dark:text-zinc-300">dislike</span> points to amplify their scoring weight (+20%).{" "}
            <span className="text-gray-700 dark:text-zinc-300">Lock</span> a point to mark it as core conviction (2× weight, breaks trigger alerts).
          </p>

          {[...CATEGORY_ORDER, ...Object.keys(groups).filter((c) => !CATEGORY_ORDER.includes(c))].map((cat) => {
            const sorted = [...(groups[cat] ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
            const items = evaluation ? sortByImpact(sorted, impactMap) : sorted;
            if (!items || items.length === 0) return null;
            return (
              <div key={cat}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs uppercase tracking-widest text-gray-400 dark:text-zinc-500 font-medium">
                    {CATEGORY_LABELS[cat] ?? cat}
                  </h3>
                  <button
                    onClick={() => setAddForCategory(addForCategory === cat ? null : cat)}
                    className="p-0.5 text-gray-300 dark:text-zinc-600 hover:text-accent transition-colors rounded"
                    title={`Add point to ${CATEGORY_LABELS[cat] ?? cat}`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {addForCategory === cat && (
                  <form onSubmit={handleAddManual} className="flex gap-2 mb-2">
                    <input
                      type="text" value={addStatement} onChange={(e) => setAddStatement(e.target.value)}
                      placeholder="Enter thesis point (min 10 chars)…" autoFocus
                      className="flex-1 px-3 py-1.5 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
                    />
                    <button type="submit" disabled={addingManual || addStatement.trim().length < 10}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs bg-accent hover:bg-accent-hover disabled:bg-gray-100 dark:disabled:bg-zinc-800 disabled:text-gray-400 dark:disabled:text-zinc-600 text-white rounded-lg transition-colors shrink-0">
                      {addingManual ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                      Add
                    </button>
                    <button type="button" onClick={() => { setAddForCategory(null); setAddStatement(""); }}
                      className="p-1.5 text-gray-400 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-300 transition-colors shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </form>
                )}

                <div className="flex flex-col gap-1">
                  {items.map((t) => {
                    const impact = impactMap.get(t.id);
                    const importanceIcon = IMPORTANCE_ICONS[t.importance];
                    const isFrozenBroken = frozenBreakIds.has(t.id);
                    const isStale = t.last_confirmed
                      ? (Date.now() - new Date(t.last_confirmed).getTime()) > 30 * 86400000
                      : theses.some((x) => x.last_confirmed) // only flag if others have been confirmed

                    return editingId === t.id ? (
                      <div key={t.id} className="flex flex-col gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600">
                        <textarea value={editDraft} onChange={(e) => setEditDraft(e.target.value)} rows={3}
                          className="w-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-gray-900 dark:text-white resize-none focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
                        />
                        <div className="flex gap-2">
                          <button onClick={() => handleSaveEdit(t.id)}
                            className="flex items-center gap-1 px-3 py-1 text-xs bg-accent hover:bg-accent-hover text-white rounded-md transition-colors">
                            <Save className="w-3 h-3" />Save
                          </button>
                          <button onClick={() => setEditingId(null)}
                            className="flex items-center gap-1 px-3 py-1 text-xs bg-gray-100 dark:bg-zinc-700 hover:bg-gray-200 dark:hover:bg-zinc-600 text-gray-600 dark:text-zinc-300 rounded-md transition-colors">
                            <X className="w-3 h-3" />Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div key={t.id} className={`group flex items-start gap-3 px-3 py-2.5 rounded-lg transition-all ${
                        isFrozenBroken
                          ? "border-l-2 border-red-500 bg-red-50 dark:bg-red-950/30"
                          : t.frozen
                          ? "border-l-2 border-amber-400 bg-amber-50 dark:bg-amber-950/20"
                          : t.conviction === "liked" && impact?.type === "broken"
                          ? "border-l-2 border-orange-400 bg-orange-50 dark:bg-orange-950/20"
                          : t.conviction === "liked"
                          ? "border-l-2 border-green-500 bg-green-50 dark:bg-green-950/20"
                          : t.conviction === "disliked"
                          ? "border-l-2 border-red-400 bg-red-50 dark:bg-red-950/20"
                          : impact?.type === "confirmed"
                          ? "border-l-2 border-green-500 bg-green-50/60 dark:bg-green-950/10"
                          : impact?.type === "broken"
                          ? "border-l-2 border-red-400 bg-red-50/60 dark:bg-red-950/10"
                          : "bg-white dark:bg-zinc-800/50 border border-gray-100 dark:border-zinc-700/50 hover:border-gray-200 dark:hover:border-zinc-600"
                      }`}>
                        {importanceIcon && (
                          <span title={importanceIcon.label} className="shrink-0 mt-0.5">
                            <importanceIcon.Icon className={importanceIcon.className} />
                          </span>
                        )}
                        {t.frozen && <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />}

                        <span className="flex-1 min-w-0">
                          <span className="flex items-start gap-1.5">
                            <span className="text-sm leading-relaxed text-gray-800 dark:text-zinc-200">{t.statement}</span>
                            {isStale && (
                              <span title="Not confirmed in 30+ days — consider re-evaluating"
                                className="shrink-0 mt-1 w-1.5 h-1.5 rounded-full bg-amber-400 dark:bg-amber-500" />
                            )}
                          </span>
                          {t.last_confirmed && (
                            <span className="block text-[10px] text-gray-400 dark:text-zinc-600 mt-0.5">
                              confirmed {new Date(t.last_confirmed).toLocaleDateString()}
                            </span>
                          )}
                        </span>

                        {impact && (
                          <span className={`text-[10px] font-mono font-bold shrink-0 mt-0.5 ${
                            impact.type === "confirmed" ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"
                          }`}>
                            {impact.type === "confirmed" ? `+${impact.pts}` : `\u2212${impact.pts}`}
                          </span>
                        )}

                        {/* Conviction + lock buttons */}
                        <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
                          <button onClick={(e) => { e.stopPropagation(); handleConviction(t, "liked"); }}
                            title="Like — amplifies positive signals (+20%)"
                            className={`p-1 rounded transition-colors ${
                              t.conviction === "liked"
                                ? "text-green-600 bg-green-100 dark:bg-green-900/40"
                                : "text-gray-300 dark:text-zinc-600 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20"
                            }`}>
                            <ThumbsUp className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleConviction(t, "disliked"); }}
                            title="Dislike — amplifies negative signals (+20% deduction)"
                            className={`p-1 rounded transition-colors ${
                              t.conviction === "disliked"
                                ? "text-red-500 bg-red-100 dark:bg-red-900/40"
                                : "text-gray-300 dark:text-zinc-600 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                            }`}>
                            <ThumbsDown className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleFreeze(t); }}
                            title={t.frozen ? "Unlock conviction point" : "Lock as core conviction (2× weight)"}
                            className={`p-1 rounded transition-colors ${
                              t.frozen
                                ? "text-amber-500 bg-amber-100 dark:bg-amber-900/40"
                                : "text-gray-300 dark:text-zinc-600 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                            }`}>
                            {t.frozen ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                          </button>
                          {/* Edit / Delete / Explain — hover only */}
                          <div className="flex gap-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={(e) => { e.stopPropagation(); if (!isOpen) togglePanel(); fireExplainThesisPoint(t.statement); }}
                              title="Explain this point"
                              className="p-1 text-gray-300 dark:text-zinc-600 hover:text-indigo-500 rounded transition-colors">
                              <Info className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); startEdit(t); }}
                              title="Edit"
                              className="p-1 text-gray-300 dark:text-zinc-600 hover:text-gray-600 dark:hover:text-zinc-300 rounded transition-colors">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); requestDelete(t); }}
                              title="Delete"
                              className="p-1 text-gray-300 dark:text-zinc-600 hover:text-red-500 rounded transition-colors">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
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

      {/* Audit log */}
      <div className="mt-4 border border-gray-100 dark:border-zinc-800 rounded-xl overflow-hidden">
        <button
          onClick={async () => {
            const next = !auditOpen;
            setAuditOpen(next);
            if (next && auditLog.length === 0) {
              setAuditLoading(true);
              try {
                const entries = await getThesisAudit(ticker, pid);
                setAuditLog(entries);
              } catch { /* silent */ }
              finally { setAuditLoading(false); }
            }
          }}
          className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
        >
          <span className="flex items-center gap-1.5 font-medium">
            <History className="w-3.5 h-3.5" />
            Change History
          </span>
          {auditOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        {auditOpen && (
          <div className="border-t border-gray-100 dark:border-zinc-800 divide-y divide-gray-50 dark:divide-zinc-800/60 max-h-72 overflow-y-auto">
            {auditLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              </div>
            ) : auditLog.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-zinc-500 px-4 py-4 text-center">No changes recorded yet.</p>
            ) : auditLog.map((entry) => {
              const actionColors: Record<string, string> = {
                created: "text-green-600 dark:text-green-400",
                deleted: "text-red-500",
                frozen: "text-amber-500",
                unfrozen: "text-amber-500",
                liked: "text-green-500",
                disliked: "text-red-400",
                conviction_cleared: "text-gray-400",
                updated: "text-blue-500",
              };
              const color = actionColors[entry.action] ?? "text-gray-400";
              const when = new Date(entry.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
              return (
                <div key={entry.id} className="px-4 py-2.5 flex items-start gap-3">
                  <span className={`text-[10px] font-semibold uppercase tracking-wide mt-0.5 w-20 shrink-0 ${color}`}>{entry.action}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-600 dark:text-zinc-300 leading-snug line-clamp-2">{entry.statement_snapshot}</p>
                    {entry.field_changed === "statement" && entry.old_value && (
                      <p className="text-[11px] text-gray-400 dark:text-zinc-500 mt-0.5 italic line-clamp-1">was: &ldquo;{entry.old_value}&rdquo;</p>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-400 dark:text-zinc-600 shrink-0">{when}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirmation dialog — only for unfreeze / delete-frozen / edit-frozen */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-2xl p-6 max-w-md mx-4 shadow-2xl">
            <h3 className="text-gray-900 dark:text-zinc-100 text-sm font-semibold mb-2">
              {confirmAction.type === "unfreeze" ? "Unlock Conviction Point?"
                : confirmAction.type === "delete" ? "Delete Locked Point?"
                : "Edit Locked Point?"}
            </h3>
            <p className="text-gray-500 dark:text-zinc-500 text-xs mb-1">This is a locked conviction point:</p>
            <p className="text-gray-700 dark:text-zinc-300 text-sm mb-4 italic border-l-2 border-amber-400 pl-3">
              &quot;{confirmAction.thesis.statement}&quot;
            </p>
            <p className="text-gray-500 dark:text-zinc-500 text-xs mb-4">
              {confirmAction.type === "unfreeze"
                ? "Unlocking removes 2× weight and disables break alerts for this point."
                : confirmAction.type === "delete"
                ? "Locked points are core convictions. Deleting removes a key part of your investment rationale."
                : "Editing changes a core conviction. The AI will re-evaluate this point on next run."}
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmAction(null)}
                className="px-4 py-2 text-xs bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-600 dark:text-zinc-400 rounded-lg transition-colors">
                Cancel
              </button>
              <button
                onClick={
                  confirmAction.type === "unfreeze"
                    ? () => { doUnfreeze(confirmAction.thesis); setConfirmAction(null); }
                    : confirmAction.type === "delete"
                    ? confirmDeleteFrozen
                    : confirmEditFrozen
                }
                className={`px-4 py-2 text-xs text-white rounded-lg transition-colors ${
                  confirmAction.type === "unfreeze" ? "bg-amber-500 hover:bg-amber-600"
                    : "bg-red-600 hover:bg-red-700"
                }`}>
                {confirmAction.type === "unfreeze" ? "Unlock"
                  : confirmAction.type === "delete" ? "Delete Anyway"
                  : "Edit Anyway"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
