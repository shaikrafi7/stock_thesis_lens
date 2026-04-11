"use client";

import { useEffect, useState } from "react";
import {
  fetchPortfolios, fetchStocks, getLatestEvaluation,
  type Portfolio, type Stock, type Evaluation,
} from "@/lib/api";
import { X, Loader2 } from "lucide-react";
import StatusBadge from "./StatusBadge";

interface PortfolioSnapshot {
  portfolio: Portfolio;
  stocks: Stock[];
  evaluations: (Evaluation | null)[];
  avg: number | null;
}

interface Props {
  onClose: () => void;
}

function scoreColor(s: number) {
  return s >= 75 ? "text-green-600 dark:text-green-400" : s >= 50 ? "text-amber-500" : "text-red-500";
}

export default function PortfolioComparison({ onClose }: Props) {
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const portfolios = await fetchPortfolios();
      const all = await Promise.all(
        portfolios.map(async (p) => {
          const stocks = await fetchStocks(p.id).catch(() => [] as Stock[]);
          const evaluations = await Promise.all(
            stocks.map((s) => getLatestEvaluation(s.ticker, p.id).catch(() => null))
          );
          const scores = evaluations.filter((e): e is Evaluation => e !== null).map((e) => e.score);
          const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
          return { portfolio: p, stocks, evaluations, avg };
        })
      );
      setSnapshots(all);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-2xl w-full max-w-4xl max-h-[80vh] overflow-auto shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-zinc-800 sticky top-0 bg-white dark:bg-zinc-900 z-10">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Portfolio Comparison</h2>
          <button onClick={onClose} className="p-1 text-gray-400 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-accent" />
          </div>
        ) : snapshots.length < 2 ? (
          <div className="px-6 py-12 text-center text-gray-400 dark:text-zinc-500 text-sm">
            You need at least 2 portfolios to compare. Create another portfolio from the header menu.
          </div>
        ) : (
          <div className="px-6 py-4">
            {/* Summary row */}
            <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: `repeat(${snapshots.length}, minmax(0, 1fr))` }}>
              {snapshots.map((s) => (
                <div key={s.portfolio.id} className="rounded-xl border border-gray-200 dark:border-zinc-700 p-4 flex flex-col gap-1">
                  <p className="text-xs font-semibold text-gray-700 dark:text-zinc-300 truncate">{s.portfolio.name}</p>
                  {s.portfolio.is_default && (
                    <span className="text-[10px] text-accent">Default</span>
                  )}
                  <p className="text-2xl font-mono font-bold mt-1">
                    {s.avg !== null ? (
                      <span className={scoreColor(s.avg)}>{Math.round(s.avg)}</span>
                    ) : (
                      <span className="text-gray-300 dark:text-zinc-600">—</span>
                    )}
                    <span className="text-xs text-gray-400 dark:text-zinc-500 font-normal ml-1">/100 avg</span>
                  </p>
                  <p className="text-xs text-gray-400 dark:text-zinc-500">{s.stocks.length} stock{s.stocks.length !== 1 ? "s" : ""}</p>
                </div>
              ))}
            </div>

            {/* Per-stock breakdown */}
            <div className="flex flex-col gap-1">
              <div className="grid gap-4 text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-500 px-1 pb-1 border-b border-gray-100 dark:border-zinc-800"
                style={{ gridTemplateColumns: `120px repeat(${snapshots.length}, minmax(0, 1fr))` }}>
                <span>Stock</span>
                {snapshots.map((s) => <span key={s.portfolio.id} className="truncate">{s.portfolio.name}</span>)}
              </div>

              {/* Collect all tickers across all portfolios */}
              {Array.from(new Set(snapshots.flatMap((s) => s.stocks.map((st) => st.ticker)))).sort().map((ticker) => (
                <div key={ticker}
                  className="grid gap-4 items-center py-2 px-1 border-b border-gray-50 dark:border-zinc-800/50 last:border-0"
                  style={{ gridTemplateColumns: `120px repeat(${snapshots.length}, minmax(0, 1fr))` }}>
                  <span className="text-sm font-mono font-bold text-gray-900 dark:text-white">{ticker}</span>
                  {snapshots.map((s) => {
                    const idx = s.stocks.findIndex((st) => st.ticker === ticker);
                    if (idx === -1) return <span key={s.portfolio.id} className="text-gray-200 dark:text-zinc-700 text-xs">—</span>;
                    const ev = s.evaluations[idx];
                    return (
                      <div key={s.portfolio.id} className="flex items-center gap-1.5">
                        {ev ? (
                          <>
                            <span className={`text-sm font-mono font-bold ${scoreColor(ev.score)}`}>{Math.round(ev.score)}</span>
                            <StatusBadge status={ev.status} />
                          </>
                        ) : (
                          <span className="text-xs text-gray-400 dark:text-zinc-500">No eval</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
