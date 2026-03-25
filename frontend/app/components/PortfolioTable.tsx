"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import DeleteStockButton from "./DeleteStockButton";
import StatusBadge from "./StatusBadge";
import type { Stock, Evaluation, StockTrend, EvaluationSummary } from "@/lib/api";
import MiniSparkline from "./MiniSparkline";
import { TrendingUp, TrendingDown, Minus, CircleDot } from "lucide-react";

const TREND_ICONS: Record<string, { Icon: typeof TrendingUp; color: string }> = {
  up: { Icon: TrendingUp, color: "text-green-400" },
  down: { Icon: TrendingDown, color: "text-red-400" },
  flat: { Icon: Minus, color: "text-zinc-500" },
  new: { Icon: CircleDot, color: "text-teal-400" },
};

type SortField = "ticker" | "score";
type SortDir = "asc" | "desc";

interface Props {
  stocks: Stock[];
  evaluations: (Evaluation | null)[];
  trendMap: Record<string, StockTrend>;
  scoreHistories: Record<string, EvaluationSummary[]>;
}

export default function PortfolioTable({ stocks, evaluations, trendMap, scoreHistories }: Props) {
  const [sortField, setSortField] = useState<SortField>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sortedRows = useMemo(() => {
    const rows = stocks.map((stock, i) => ({ stock, evaluation: evaluations[i] }));
    rows.sort((a, b) => {
      let cmp: number;
      if (sortField === "ticker") {
        cmp = a.stock.ticker.localeCompare(b.stock.ticker);
      } else {
        const sa = a.evaluation?.score ?? -1;
        const sb = b.evaluation?.score ?? -1;
        cmp = sa - sb;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [stocks, evaluations, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "score" ? "desc" : "asc");
    }
  }

  const arrow = (field: SortField) => {
    if (sortField !== field) return "";
    return sortDir === "asc" ? " \u25B2" : " \u25BC";
  };

  return (
    <div>
      {/* Sort controls */}
      <div className="flex gap-3 mb-2">
        <button
          onClick={() => toggleSort("ticker")}
          className={`text-[10px] uppercase tracking-widest transition-colors ${
            sortField === "ticker" ? "text-zinc-300" : "text-zinc-600 hover:text-zinc-400"
          }`}
        >
          Ticker{arrow("ticker")}
        </button>
        <button
          onClick={() => toggleSort("score")}
          className={`text-[10px] uppercase tracking-widest transition-colors ${
            sortField === "score" ? "text-zinc-300" : "text-zinc-600 hover:text-zinc-400"
          }`}
        >
          Score{arrow("score")}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {sortedRows.map(({ stock, evaluation }) => {
          const trend = trendMap[stock.ticker];
          const trendInfo = trend ? TREND_ICONS[trend.trend] ?? TREND_ICONS.flat : null;
          const history = scoreHistories[stock.ticker];
          return (
            <div
              key={stock.ticker}
              className="flex items-center justify-between px-4 py-3 bg-surface border border-zinc-800 rounded-xl hover:border-zinc-600 hover:bg-surface-raised/50 transition-all group"
            >
              <Link
                href={`/stocks/${stock.ticker}`}
                className="flex items-center gap-4 flex-1 min-w-0"
              >
                <div className="w-8 h-8 rounded-lg shrink-0 overflow-hidden bg-zinc-800 flex items-center justify-center">
                  {stock.logo_url ? (
                    <img src={stock.logo_url} alt={stock.ticker} className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-xs font-bold text-zinc-400">{stock.ticker[0]}</span>
                  )}
                </div>
                <span className="font-mono font-semibold text-white w-16 shrink-0">
                  {stock.ticker}
                </span>
                <span className="text-zinc-400 text-sm truncate">
                  {stock.name}
                </span>
              </Link>
              <div className="flex items-center gap-3 shrink-0 ml-4">
                {evaluation ? (
                  <>
                    <span className="text-zinc-500 text-xs font-mono">
                      {evaluation.score}/100
                    </span>
                    {history && history.length >= 2 && (
                      <MiniSparkline scores={history.map((e) => e.score)} />
                    )}
                    {trendInfo && (
                      <span
                        className={trendInfo.color}
                        title={trend?.previous_score != null ? `prev: ${trend.previous_score}` : "first evaluation"}
                      >
                        <trendInfo.Icon className="w-3.5 h-3.5" />
                      </span>
                    )}
                    <StatusBadge status={evaluation.status} />
                  </>
                ) : (
                  <span className="text-zinc-600 text-xs">
                    Not evaluated
                  </span>
                )}
                <DeleteStockButton ticker={stock.ticker} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
