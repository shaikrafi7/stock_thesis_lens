"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getPortfolioReturns, type EvaluationSummary } from "@/lib/api";
import { usePortfolio } from "@/app/context/PortfolioContext";
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp } from "lucide-react";

interface DataPoint {
  ticker: string;
  score: number;
  returnPct: number;
}

interface Props {
  scoreHistories?: Record<string, EvaluationSummary[]>;
}

export default function ConvictionVsReturns({ scoreHistories: externalHistories }: Props) {
  const { activePortfolioId } = usePortfolio();
  const [data, setData] = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [period, setPeriod] = useState("3mo");

  useEffect(() => {
    setLoading(true);
    getPortfolioReturns(period, activePortfolioId).then((returns) => {
      const histories = externalHistories || {};
      const returnMap: Record<string, number> = {};
      for (const s of returns.stocks) returnMap[s.ticker] = s.return_pct;

      const points: DataPoint[] = [];
      for (const [ticker, evals] of Object.entries(histories as Record<string, EvaluationSummary[]>)) {
        if (!evals.length) continue;
        const latestScore = evals[evals.length - 1].score;
        const ret = returnMap[ticker];
        if (ret !== undefined) {
          points.push({ ticker, score: latestScore, returnPct: ret });
        }
      }
      points.sort((a, b) => b.score - a.score);
      setData(points);
    }).catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [activePortfolioId, period, externalHistories]);

  if (!loading && data.length === 0) return null;

  // Correlation insight: do higher conviction stocks have better returns?
  const corr = data.length >= 3 ? (() => {
    const n = data.length;
    const mx = data.reduce((s, d) => s + d.score, 0) / n;
    const my = data.reduce((s, d) => s + d.returnPct, 0) / n;
    const num = data.reduce((s, d) => s + (d.score - mx) * (d.returnPct - my), 0);
    const den = Math.sqrt(
      data.reduce((s, d) => s + (d.score - mx) ** 2, 0) *
      data.reduce((s, d) => s + (d.returnPct - my) ** 2, 0)
    );
    return den === 0 ? 0 : num / den;
  })() : 0;

  const corrLabel = corr > 0.3 ? "Conviction is predicting returns" : corr < -0.3 ? "Lower-conviction picks outperforming" : "Conviction not yet predictive";

  return (
    <div className="border border-gray-100 dark:border-zinc-800 rounded-2xl overflow-hidden">
      <button
        onClick={() => setCollapsed((p) => !p)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700 dark:text-zinc-200 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-accent" />
          Conviction vs Returns
          {!collapsed && data.length > 0 && (
            <span className="text-[10px] font-normal text-gray-400 dark:text-zinc-500">
              {corrLabel}
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {!collapsed && (
            <div className="flex gap-0.5">
              {["1mo", "3mo", "6mo", "1y"].map((p) => (
                <button
                  key={p}
                  onClick={(e) => { e.stopPropagation(); setPeriod(p); }}
                  className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                    period === p
                      ? "bg-accent/20 text-accent"
                      : "text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
          {collapsed ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {!collapsed && (
        <div className="border-t border-gray-100 dark:border-zinc-800">
          {loading ? (
            <div className="px-4 py-3 text-xs text-gray-400 dark:text-zinc-500">Loading…</div>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-zinc-800/50">
              {data.map((d) => {
                const isPositiveReturn = d.returnPct >= 0;
                const barWidth = Math.min(Math.abs(d.returnPct) * 2, 100);
                return (
                  <div key={d.ticker} className="flex items-center gap-3 px-4 py-2">
                    <Link
                      href={`/stocks/${d.ticker}`}
                      className="text-xs font-mono font-bold text-gray-700 dark:text-zinc-300 hover:text-accent transition-colors w-12 shrink-0"
                    >
                      {d.ticker}
                    </Link>
                    {/* Conviction score bar */}
                    <div className="w-20 shrink-0">
                      <div className="flex items-center gap-1">
                        <div className="flex-1 bg-gray-100 dark:bg-zinc-700 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${d.score >= 70 ? "bg-green-500" : d.score >= 50 ? "bg-yellow-400" : "bg-red-400"}`}
                            style={{ width: `${d.score}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-gray-500 dark:text-zinc-400 w-6 text-right">{d.score}</span>
                      </div>
                    </div>
                    {/* Return bar */}
                    <div className="flex-1 flex items-center gap-1.5">
                      <div className="flex-1 relative h-3 flex items-center">
                        <div className="absolute left-1/2 w-px h-3 bg-gray-200 dark:bg-zinc-600" />
                        <div
                          className={`absolute h-2 rounded-sm ${isPositiveReturn ? "left-1/2" : "right-1/2"} ${isPositiveReturn ? "bg-green-400 dark:bg-green-500" : "bg-red-400"}`}
                          style={{ width: `${barWidth / 2}%` }}
                        />
                      </div>
                      <span className={`text-[11px] font-mono font-medium w-14 text-right shrink-0 ${isPositiveReturn ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                        {isPositiveReturn ? "+" : ""}{d.returnPct.toFixed(1)}%
                      </span>
                      {isPositiveReturn ? (
                        <TrendingUp className="w-3 h-3 text-green-500 shrink-0" />
                      ) : (
                        <TrendingDown className="w-3 h-3 text-red-400 shrink-0" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
