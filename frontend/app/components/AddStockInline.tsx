"use client";

import { useState } from "react";
import { addStock, previewThesis, confirmPreview, type ThesisPreview } from "@/lib/api";
import { usePortfolio } from "@/app/context/PortfolioContext";
import { Plus, Loader2, Check, X } from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  competitive_moat: "Competitive Moat",
  growth_trajectory: "Growth Trajectory",
  valuation: "Valuation",
  financial_health: "Financial Health",
  ownership_conviction: "Ownership & Conviction",
  risks: "Risks & Bear Case",
};

export default function AddStockInline({ onAdded, portfolioId }: { onAdded?: () => void | Promise<void>; portfolioId?: number | null }) {
  const { bumpStocksVersion } = usePortfolio();
  const [ticker, setTicker] = useState("");
  const [step, setStep] = useState<"idle" | "adding" | "previewing" | "confirming">("idle");
  const [pendingTicker, setPendingTicker] = useState("");
  const [previewPoints, setPreviewPoints] = useState<ThesisPreview[]>([]);
  const [rejected, setRejected] = useState<Set<number>>(new Set());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const raw = ticker.trim().toUpperCase();
    if (!raw || step !== "idle") return;

    // Only handle single ticker in inline form; multi-ticker goes straight through
    const tickers = raw.split(",").map((t) => t.trim()).filter(Boolean);
    if (tickers.length > 1) {
      // Multi-ticker: no preview, add all directly
      setStep("adding");
      try {
        for (const t of tickers) {
          try {
            await addStock(t, portfolioId);
            await confirmPreview(t, [], portfolioId); // saves nothing, just evaluates
          } catch { /* continue */ }
        }
        setTicker("");
        bumpStocksVersion();
        await onAdded?.();
      } finally {
        setStep("idle");
      }
      return;
    }

    const t = tickers[0];
    setStep("adding");
    try {
      await addStock(t, portfolioId);
      const preview = await previewThesis(t, portfolioId);
      setPendingTicker(t);
      setPreviewPoints(preview);
      setRejected(new Set());
      setTicker("");
      setStep("previewing");
    } catch {
      setStep("idle");
    }
  }

  async function handleConfirm() {
    setStep("confirming");
    try {
      const approved = previewPoints.filter((_, i) => !rejected.has(i));
      await confirmPreview(pendingTicker, approved, portfolioId);
      bumpStocksVersion();
      await onAdded?.();
    } finally {
      setPreviewPoints([]);
      setPendingTicker("");
      setStep("idle");
    }
  }

  function toggleReject(i: number) {
    setRejected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  if (step === "previewing" || step === "confirming") {
    return (
      <div className="border border-blue-200 dark:border-blue-800 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 p-4 flex flex-col gap-3 my-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Review thesis for <span className="font-mono">{pendingTicker}</span>
          </h3>
          <span className="text-xs text-gray-400 dark:text-zinc-500">
            {previewPoints.length - rejected.size} of {previewPoints.length} selected
          </span>
        </div>
        <div className="flex flex-col gap-1.5 max-h-96 overflow-y-auto">
          {previewPoints.map((p, i) => {
            const isRejected = rejected.has(i);
            return (
              <div
                key={i}
                onClick={() => toggleReject(i)}
                className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                  isRejected
                    ? "bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 opacity-40"
                    : "bg-white dark:bg-zinc-800 border-blue-300 dark:border-blue-700"
                }`}
              >
                <div className={`mt-0.5 w-4 h-4 rounded border shrink-0 flex items-center justify-center ${
                  isRejected ? "border-gray-300 dark:border-zinc-600" : "bg-blue-500 border-blue-500"
                }`}>
                  {!isRejected && <Check className="w-3 h-3 text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-zinc-500">
                    {CATEGORY_LABELS[p.category] ?? p.category}
                  </span>
                  <p className="text-xs text-gray-800 dark:text-zinc-200 mt-0.5 leading-snug">{p.statement}</p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleConfirm}
            disabled={step === "confirming" || rejected.size === previewPoints.length}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg transition-colors font-medium"
          >
            {step === "confirming" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {step === "confirming" ? "Saving…" : "Add to Portfolio"}
          </button>
          <button
            onClick={() => { setPreviewPoints([]); setPendingTicker(""); setStep("idle"); }}
            disabled={step === "confirming"}
            className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-200 rounded-lg border border-gray-200 dark:border-zinc-700 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-1.5">
      <input
        type="text"
        value={ticker}
        onChange={(e) => setTicker(e.target.value)}
        placeholder="AAPL, NVDA..."
        className="w-40 px-2.5 py-1.5 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:border-accent"
      />
      <button
        type="submit"
        disabled={step !== "idle" || !ticker.trim()}
        className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-accent hover:bg-accent-hover disabled:bg-gray-100 dark:disabled:bg-zinc-900 disabled:text-gray-400 dark:disabled:text-zinc-500 text-white rounded-lg transition-colors font-medium"
      >
        {step === "adding" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        {step === "adding" ? "Adding…" : "Add"}
      </button>
    </form>
  );
}
