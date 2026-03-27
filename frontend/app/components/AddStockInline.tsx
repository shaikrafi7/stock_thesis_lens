"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addStock } from "@/lib/api";
import { Plus, Loader2 } from "lucide-react";

export default function AddStockInline() {
  const router = useRouter();
  const [ticker, setTicker] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = ticker.trim().toUpperCase();
    if (!t || adding) return;
    setAdding(true);
    try {
      await addStock(t);
      setTicker("");
      router.refresh();
    } catch {
      // silent
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
        placeholder="Add ticker..."
        className="w-28 px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-accent"
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
