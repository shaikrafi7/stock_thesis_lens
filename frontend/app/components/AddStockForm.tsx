"use client";

import { useState } from "react";
import { addStock, generateThesis } from "@/lib/api";
import { useRouter } from "next/navigation";

export default function AddStockForm() {
  const router = useRouter();
  const [ticker, setTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    setLoading(true);
    setError("");
    try {
      await addStock(t);
      await generateThesis(t);
      setTicker("");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add stock");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 items-start">
      <div className="flex flex-col gap-1">
        <input
          type="text"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          placeholder="Ticker (e.g. AAPL)"
          maxLength={10}
          disabled={loading}
          className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 uppercase w-40"
        />
        {error && <p className="text-red-400 text-xs">{error}</p>}
      </div>
      <button
        type="submit"
        disabled={loading || !ticker.trim()}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded transition-colors"
      >
        {loading ? "Adding…" : "Add Stock"}
      </button>
    </form>
  );
}
