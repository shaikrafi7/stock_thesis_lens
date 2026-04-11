"use client";

import { useState, useRef, useEffect } from "react";
import { addStock, previewThesis, confirmPreview, searchTickers, type ThesisPreview, type TickerSuggestion } from "@/lib/api";
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
  const [suggestions, setSuggestions] = useState<TickerSuggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    const val = ticker.trim();
    if (!val || val.includes(",") || step !== "idle") {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchTickers(val);
        setSuggestions(results);
        setShowDropdown(results.length > 0);
      } catch {
        setSuggestions([]);
      }
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [ticker, step]);

  // Close dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function selectSuggestion(s: TickerSuggestion) {
    setTicker(s.ticker);
    setShowDropdown(false);
    setSuggestions([]);
    inputRef.current?.focus();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const raw = ticker.trim().toUpperCase();
    if (!raw || step !== "idle") return;
    setShowDropdown(false);

    const tickers = raw.split(",").map((t) => t.trim()).filter(Boolean);
    if (tickers.length > 1) {
      setStep("adding");
      try {
        for (const t of tickers) {
          try {
            await addStock(t, portfolioId);
            await confirmPreview(t, [], portfolioId);
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
        <p className="text-[11px] text-blue-600 dark:text-blue-400 leading-snug">
          A good thesis point is specific, falsifiable, and time-bound. Uncheck any points that feel generic or don&rsquo;t match your view — you own this thesis.
        </p>
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
    <form onSubmit={handleSubmit} className="flex gap-1.5 relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
          placeholder="AAPL, NVDA..."
          className="w-44 px-2.5 py-1.5 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:border-accent"
        />
        {showDropdown && suggestions.length > 0 && (
          <div
            ref={dropdownRef}
            className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl shadow-lg z-50 overflow-hidden"
          >
            {suggestions.map((s) => (
              <button
                key={s.ticker}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors text-left"
              >
                <span className="font-mono font-semibold text-xs text-accent w-14 shrink-0">{s.ticker}</span>
                <span className="text-xs text-gray-500 dark:text-zinc-400 truncate">{s.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
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
