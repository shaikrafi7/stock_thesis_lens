"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  fetchStocks,
  addStock,
  getPortfolioScoreHistories,
  type Stock,
  type EvaluationSummary,
} from "@/lib/api";
import { usePortfolio } from "@/app/context/PortfolioContext";
import StatusBadge from "./StatusBadge";
import DeleteStockButton from "./DeleteStockButton";
import { Plus, Loader2, Clock } from "lucide-react";

function evalAge(history: EvaluationSummary[] | undefined): { label: string; color: string } | null {
  if (!history || history.length === 0) return null;
  const latest = history[history.length - 1];
  const ts = new Date(latest.timestamp);
  const now = new Date();
  const diffMs = now.getTime() - ts.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return { label: `${diffMin}m ago`, color: "text-zinc-500" };
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return { label: `${diffHr}h ago`, color: "text-zinc-500" };
  const diffDays = Math.floor(diffHr / 24);
  const color = diffDays > 7 ? "text-red-400" : diffDays > 3 ? "text-amber-400" : "text-zinc-500";
  return { label: `${diffDays}d ago`, color };
}

export default function PortfolioSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { activePortfolioId } = usePortfolio();
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [scoreHistories, setScoreHistories] = useState<Record<string, EvaluationSummary[]>>({});
  const [loading, setLoading] = useState(true);
  const [tickerInput, setTickerInput] = useState("");
  const [adding, setAdding] = useState(false);

  type SortField = "ticker" | "score";
  type SortDir = "asc" | "desc";
  const [sortField, setSortField] = useState<SortField>("ticker");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

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

  const sortedStocks = useMemo(() => {
    return [...stocks].sort((a, b) => {
      let cmp: number;
      if (sortField === "ticker") {
        cmp = a.ticker.localeCompare(b.ticker);
      } else {
        const sa = scoreHistories[a.ticker]?.slice(-1)[0]?.score ?? -1;
        const sb = scoreHistories[b.ticker]?.slice(-1)[0]?.score ?? -1;
        cmp = sa - sb;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [stocks, scoreHistories, sortField, sortDir]);

  useEffect(() => {
    Promise.all([
      fetchStocks(activePortfolioId).catch(() => [] as Stock[]),
      getPortfolioScoreHistories(10, activePortfolioId).catch(() => ({} as Record<string, EvaluationSummary[]>)),
    ]).then(([s, h]) => {
      setStocks(s);
      setScoreHistories(h);
      setLoading(false);
    });
  }, [pathname]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const t = tickerInput.trim().toUpperCase();
    if (!t || adding) return;
    setAdding(true);
    try {
      await addStock(t, activePortfolioId);
      setTickerInput("");
      const fresh = await fetchStocks(activePortfolioId);
      setStocks(fresh);
      router.refresh();
    } catch {
      // silent
    } finally {
      setAdding(false);
    }
  }

  const activeTicker = pathname.startsWith("/stocks/")
    ? pathname.split("/")[2]?.toUpperCase()
    : null;

  return (
    <div className="bg-surface border border-zinc-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">
          Portfolio
        </span>
        {/* Sort controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => toggleSort("ticker")}
            className={`text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded transition-colors ${
              sortField === "ticker" ? "text-zinc-200 bg-zinc-800" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            A-Z{arrow("ticker")}
          </button>
          <button
            onClick={() => toggleSort("score")}
            className={`text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded transition-colors ${
              sortField === "score" ? "text-zinc-200 bg-zinc-800" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Score{arrow("score")}
          </button>
        </div>
      </div>

      {/* Stock list */}
      <div className="py-1">
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
          </div>
        ) : stocks.length === 0 ? (
          <p className="text-zinc-600 text-xs px-3 py-4 text-center">No stocks yet</p>
        ) : (
          sortedStocks.map((stock) => {
            const history = scoreHistories[stock.ticker];
            const latest = history?.[history.length - 1];
            const score = latest?.score;
            const status = latest?.status as "green" | "yellow" | "red" | undefined;
            const age = evalAge(history);
            const isActive = activeTicker === stock.ticker;

            return (
              <Link
                key={stock.ticker}
                href={`/stocks/${stock.ticker}`}
                className={`flex items-center gap-2 px-3 py-2 transition-colors ${
                  isActive
                    ? "bg-accent/10 border-l-2 border-accent"
                    : "hover:bg-surface-raised/50 border-l-2 border-transparent"
                }`}
              >
                <div className="w-5 h-5 rounded shrink-0 overflow-hidden bg-zinc-800 flex items-center justify-center">
                  {stock.logo_url ? (
                    <img src={stock.logo_url} alt={stock.ticker} className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-[8px] font-bold text-zinc-400">{stock.ticker[0]}</span>
                  )}
                </div>
                <span className="font-mono text-xs font-semibold text-zinc-200 w-10 shrink-0">
                  {stock.ticker}
                </span>
                <div className="flex-1 flex items-center justify-end gap-1.5">
                  {score != null ? (
                    <>
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] font-mono text-zinc-400">{score}</span>
                        {age && (
                          <span className={`text-[8px] ${age.color} flex items-center gap-0.5`}>
                            <Clock className="w-2 h-2" />
                            {age.label}
                          </span>
                        )}
                      </div>
                      {status && <StatusBadge status={status} />}
                    </>
                  ) : (
                    <span className="text-[9px] text-zinc-600">--</span>
                  )}
                </div>
              </Link>
            );
          })
        )}
      </div>

      {/* Delete active stock */}
      {activeTicker && (
        <div className="px-3 py-1.5 border-t border-zinc-800 flex items-center justify-between">
          <span className="text-[9px] text-zinc-500 uppercase tracking-widest">Remove {activeTicker}</span>
          <DeleteStockButton ticker={activeTicker} redirectTo="/" />
        </div>
      )}

      {/* Add stock */}
      <form onSubmit={handleAdd} className="px-2 py-2 border-t border-zinc-800">
        <div className="flex gap-1">
          <input
            type="text"
            value={tickerInput}
            onChange={(e) => setTickerInput(e.target.value)}
            placeholder="Add ticker..."
            className="flex-1 min-w-0 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={adding || !tickerInput.trim()}
            className="p-1 bg-accent hover:bg-accent-hover disabled:bg-zinc-800 text-white rounded transition-colors shrink-0"
          >
            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          </button>
        </div>
      </form>
    </div>
  );
}
