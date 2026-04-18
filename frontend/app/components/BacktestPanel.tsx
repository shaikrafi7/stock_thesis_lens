"use client";

import { useEffect, useState } from "react";
import { getStockBacktest, type BacktestPoint } from "@/lib/api";
import { Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  strong: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  holding: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  pressure: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  risk: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
};

function ReturnCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-300 dark:text-zinc-600">—</span>;
  const pos = value >= 0;
  return (
    <span className={`flex items-center gap-0.5 font-mono text-xs ${pos ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
      {pos ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {pos ? "+" : ""}{value.toFixed(1)}%
    </span>
  );
}

export default function BacktestPanel({ ticker, portfolioId }: { ticker: string; portfolioId?: number | null }) {
  const [data, setData] = useState<BacktestPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getStockBacktest(ticker, portfolioId)
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [ticker, portfolioId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-xs text-gray-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading backtest data…
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <p className="text-xs text-gray-400 dark:text-zinc-500 py-2">
        No evaluation history yet — run an evaluation first to see backtested conviction vs returns.
      </p>
    );
  }

  // Correlation insight: latest score vs best available return
  const withReturn = data.filter((d) => d.return_30d !== null || d.return_90d !== null);
  let insightText: string | null = null;
  if (withReturn.length >= 2) {
    const pairs = withReturn.map((d) => ({
      score: d.score,
      ret: d.return_90d ?? d.return_30d ?? 0,
    }));
    const n = pairs.length;
    const meanS = pairs.reduce((s, p) => s + p.score, 0) / n;
    const meanR = pairs.reduce((s, p) => s + p.ret, 0) / n;
    const num = pairs.reduce((s, p) => s + (p.score - meanS) * (p.ret - meanR), 0);
    const den = Math.sqrt(
      pairs.reduce((s, p) => s + (p.score - meanS) ** 2, 0) *
      pairs.reduce((s, p) => s + (p.ret - meanR) ** 2, 0)
    );
    const r = den === 0 ? 0 : num / den;
    const sample = `n=${n} evaluation${n === 1 ? "" : "s"}`;
    if (n < 4) {
      insightText = `Too few evaluations for a reliable correlation (${sample}).`;
    } else if (r > 0.3) {
      insightText = `Score trend tracks with returns for this stock (r=${r.toFixed(2)}, ${sample}). Small sample — interpret loosely.`;
    } else if (r < -0.3) {
      insightText = `Score trend inverse to returns for this stock (r=${r.toFixed(2)}, ${sample}). Small sample — could be noise.`;
    } else {
      insightText = `No clear relationship between score and returns for this stock (r=${r.toFixed(2)}, ${sample}).`;
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {insightText && (
        <p className="text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-800 rounded-lg px-3 py-2">
          {insightText}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-400 dark:text-zinc-500 uppercase tracking-wider text-[10px]">
              <th className="text-left pb-2 pr-3">Date</th>
              <th className="text-left pb-2 pr-3">Score</th>
              <th className="text-left pb-2 pr-3">Status</th>
              <th className="text-right pb-2 pr-3">Price</th>
              <th className="text-right pb-2 pr-3">+30d</th>
              <th className="text-right pb-2 pr-3">+90d</th>
              <th className="text-right pb-2">+180d</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-zinc-800/60">
            {[...data].reverse().map((d, i) => (
              <tr key={i} className="hover:bg-gray-50 dark:hover:bg-zinc-800/40 transition-colors">
                <td className="py-1.5 pr-3 text-gray-500 dark:text-zinc-400 font-mono">{d.date}</td>
                <td className="py-1.5 pr-3 font-mono font-semibold text-gray-800 dark:text-zinc-200">{d.score.toFixed(0)}</td>
                <td className="py-1.5 pr-3">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${STATUS_COLORS[d.status] ?? "bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400"}`}>
                    {d.status}
                  </span>
                </td>
                <td className="py-1.5 pr-3 text-right font-mono text-gray-600 dark:text-zinc-400">
                  {d.price_at_eval !== null ? `$${d.price_at_eval.toFixed(2)}` : <span className="text-gray-300 dark:text-zinc-600">—</span>}
                </td>
                <td className="py-1.5 pr-3 text-right"><ReturnCell value={d.return_30d} /></td>
                <td className="py-1.5 pr-3 text-right"><ReturnCell value={d.return_90d} /></td>
                <td className="py-1.5 text-right"><ReturnCell value={d.return_180d} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-gray-400 dark:text-zinc-600">
        Forward returns are measured from the price on the evaluation date. Dashes (—) indicate the return window hasn&apos;t elapsed yet.
      </p>
    </div>
  );
}
