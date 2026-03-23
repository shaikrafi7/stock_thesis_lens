"use client";

import { useState } from "react";
import { addStock, generateThesis } from "@/lib/api";
import { useRouter } from "next/navigation";

export default function AddStockForm() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [progress, setProgress] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const tickers = input
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    if (tickers.length === 0) return;

    setErrors([]);
    const errs: string[] = [];

    for (let i = 0; i < tickers.length; i++) {
      const t = tickers[i];
      setProgress(tickers.length > 1 ? `Adding ${t} (${i + 1}/${tickers.length})…` : `Adding ${t}…`);
      try {
        await addStock(t);
        await generateThesis(t);
      } catch (err: unknown) {
        errs.push(`${t}: ${err instanceof Error ? err.message : "failed"}`);
      }
    }

    setProgress("");
    setErrors(errs);
    setInput("");
    router.refresh();
  }

  const busy = progress !== "";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex gap-2 items-start">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          placeholder="AAPL, NVDA, MSFT"
          disabled={busy}
          className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 uppercase flex-1 min-w-0 max-w-xs"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded transition-colors shrink-0"
        >
          {busy ? progress : "Add"}
        </button>
      </div>
      {errors.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {errors.map((e, i) => (
            <p key={i} className="text-red-400 text-xs">{e}</p>
          ))}
        </div>
      )}
    </form>
  );
}
