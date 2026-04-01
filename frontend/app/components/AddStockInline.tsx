"use client";

import { useState } from "react";
import { addStock, generateAndEvaluate } from "@/lib/api";
import { Plus, Loader2 } from "lucide-react";

export default function AddStockInline({ onAdded }: { onAdded?: () => void | Promise<void> }) {
  const [ticker, setTicker] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const raw = ticker.trim().toUpperCase();
    if (!raw || adding) return;

    const tickers = raw.split(",").map((t) => t.trim()).filter(Boolean);
    if (tickers.length === 0) return;

    setAdding(true);
    try {
      for (const t of tickers) {
        try {
          await addStock(t);
          await generateAndEvaluate(t);
        } catch {
          // continue with remaining tickers
        }
      }
      setTicker("");
      await onAdded?.();
    } finally {
      setAdding(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-1.5">
      <input
        type="text"
        value={ticker}
        onChange={(e) => setTicker(e.target.value)}
        placeholder="AAPL, NVDA..."
        className="w-40 px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-accent"
      />
      <button
        type="submit"
        disabled={adding || !ticker.trim()}
        className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-accent hover:bg-accent-hover disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-lg transition-colors font-medium"
      >
        {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        Add
      </button>
    </form>
  );
}
