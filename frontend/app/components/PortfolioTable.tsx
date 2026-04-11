"use client";

"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import DeleteStockButton from "./DeleteStockButton";
import StatusBadge from "./StatusBadge";
import type { Stock, Evaluation, StockTrend, EvaluationSummary } from "@/lib/api";
import { toggleWatchlist } from "@/lib/api";
import MiniSparkline from "./MiniSparkline";
import { TrendingUp, TrendingDown, Minus, CircleDot, Clock, Bookmark, BookmarkCheck } from "lucide-react";

function evalAge(history: EvaluationSummary[] | undefined): { label: string; color: string } | null {
  if (!history || history.length === 0) return null;
  const latest = history[history.length - 1]; // most recent (sorted asc by backend)
  const ts = new Date(latest.timestamp);
  const now = new Date();
  const diffMs = now.getTime() - ts.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) {
    return { label: `${diffMin}m ago`, color: "text-zinc-500" };
  }
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) {
    return { label: `${diffHr}h ago`, color: "text-zinc-500" };
  }
  const diffDays = Math.floor(diffHr / 24);
  const color = diffDays > 7 ? "text-red-400" : diffDays > 3 ? "text-amber-400" : "text-zinc-500";
  return { label: `${diffDays}d ago`, color };
}

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
  priceSparklines: Record<string, number[]>;
  onStockUpdated?: (updated: Stock) => void;
}

export default function PortfolioTable({ stocks, evaluations, trendMap, scoreHistories, priceSparklines, onStockUpdated }: Props) {
  const [sortField, setSortField] = useState<SortField>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [togglingWatchlist, setTogglingWatchlist] = useState<string | null>(null);

  const allRows = useMemo(() => stocks.map((stock, i) => ({ stock, evaluation: evaluations[i] })), [stocks, evaluations]);

  const sortedRows = useMemo(() => {
    const rows = allRows.filter((r) => r.stock.watchlist !== "true");
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
  }, [allRows, sortField, sortDir]);

  const watchlistRows = useMemo(() => allRows.filter((r) => r.stock.watchlist === "true"), [allRows]);

  async function handleToggleWatchlist(ticker: string) {
    setTogglingWatchlist(ticker);
    try {
      const updated = await toggleWatchlist(ticker);
      onStockUpdated?.(updated);
    } catch { /* ignore */ }
    finally { setTogglingWatchlist(null); }
  }

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
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] text-gray-400 dark:text-zinc-600 uppercase tracking-widest">Sort by</span>
        <button
          onClick={() => toggleSort("ticker")}
          className={`text-[11px] uppercase tracking-widest px-2 py-0.5 rounded transition-colors ${
            sortField === "ticker"
              ? "text-gray-800 dark:text-zinc-200 bg-gray-100 dark:bg-zinc-800"
              : "text-gray-400 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800/50"
          }`}
        >
          Ticker{arrow("ticker")}
        </button>
        <button
          onClick={() => toggleSort("score")}
          className={`text-[11px] uppercase tracking-widest px-2 py-0.5 rounded transition-colors ${
            sortField === "score"
              ? "text-gray-800 dark:text-zinc-200 bg-gray-100 dark:bg-zinc-800"
              : "text-gray-400 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800/50"
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
          const prices = priceSparklines[stock.ticker];
          return (
            <div
              key={stock.ticker}
              className="flex items-center justify-between px-4 py-3 bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-xl hover:bg-gray-50 dark:hover:bg-zinc-800/60 transition-all duration-150 group shadow-sm"
            >
              <Link
                href={`/stocks/${stock.ticker}`}
                className="flex items-center gap-4 flex-1 min-w-0"
              >
                <div className="w-8 h-8 rounded-lg shrink-0 overflow-hidden bg-gray-100 dark:bg-zinc-800 flex items-center justify-center">
                  {stock.logo_url ? (
                    <img src={stock.logo_url} alt={stock.ticker} className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-xs font-bold text-gray-500 dark:text-zinc-400">{stock.ticker[0]}</span>
                  )}
                </div>
                <span className="font-mono font-semibold text-gray-900 dark:text-white w-16 shrink-0">
                  {stock.ticker}
                </span>
                <span className="text-gray-500 dark:text-zinc-400 text-sm truncate">
                  {stock.name}
                </span>
              </Link>
              <div className="flex items-center gap-3 shrink-0 ml-4">
                {/* 1Y price sparkline */}
                {prices && prices.length >= 2 && (
                  <MiniSparkline values={prices} />
                )}
                {evaluation ? (
                  <>
                    <div className="flex flex-col items-end">
                      <span className="text-gray-500 dark:text-zinc-500 text-xs font-mono">
                        {evaluation.score}/100
                      </span>
                      {(() => {
                        const age = evalAge(history);
                        return age ? (
                          <span className={`text-[10px] ${age.color} flex items-center gap-0.5`}>
                            <Clock className="w-2.5 h-2.5" />
                            {age.label}
                          </span>
                        ) : null;
                      })()}
                    </div>
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
                  <span className="text-gray-400 dark:text-zinc-600 text-xs">
                    Not evaluated
                  </span>
                )}
                <button
                  onClick={(e) => { e.preventDefault(); handleToggleWatchlist(stock.ticker); }}
                  disabled={togglingWatchlist === stock.ticker}
                  title={stock.watchlist === "true" ? "Remove from watchlist" : "Move to watchlist"}
                  className="p-1 text-gray-300 dark:text-zinc-700 hover:text-amber-500 transition-colors opacity-0 group-hover:opacity-100"
                >
                  {stock.watchlist === "true"
                    ? <BookmarkCheck className="w-3.5 h-3.5 text-amber-500" />
                    : <Bookmark className="w-3.5 h-3.5" />}
                </button>
                <DeleteStockButton ticker={stock.ticker} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Watchlist section */}
      {watchlistRows.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xs uppercase tracking-widest text-gray-400 dark:text-zinc-500 font-semibold mb-3">Watchlist</h3>
          <div className="flex flex-col gap-2">
            {watchlistRows.map(({ stock }) => (
              <div key={stock.ticker}
                className="flex items-center justify-between px-4 py-2.5 bg-white dark:bg-zinc-900 border border-dashed border-gray-200 dark:border-zinc-700 rounded-xl group">
                <Link href={`/stocks/${stock.ticker}`} className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-6 h-6 rounded overflow-hidden bg-gray-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                    {stock.logo_url
                      ? <img src={stock.logo_url} alt={stock.ticker} className="w-full h-full object-contain" />
                      : <span className="text-[10px] font-bold text-gray-500 dark:text-zinc-400">{stock.ticker[0]}</span>}
                  </div>
                  <span className="font-mono font-semibold text-gray-700 dark:text-zinc-300 text-sm">{stock.ticker}</span>
                  <span className="text-gray-400 dark:text-zinc-500 text-xs truncate">{stock.name}</span>
                </Link>
                <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleToggleWatchlist(stock.ticker)}
                    title="Move to portfolio"
                    className="text-[10px] text-accent hover:text-accent-hover transition-colors"
                  >
                    Add to portfolio
                  </button>
                  <DeleteStockButton ticker={stock.ticker} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
