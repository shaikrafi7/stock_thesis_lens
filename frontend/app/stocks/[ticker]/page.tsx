"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import {
  fetchStocks, getTheses, getLatestEvaluation, updateEdgeStatement,
  type Stock, type Thesis, type Evaluation,
} from "@/lib/api";
import ThesisManager from "./ThesisManager";
import StockInfoPanel from "@/app/components/StockInfoPanel";
import ScoreHistoryChart from "@/app/components/ScoreHistoryChart";
import ScoreDeltaPanel from "@/app/components/ScoreDelta";
import BacktestPanel from "@/app/components/BacktestPanel";
import StockNews from "@/app/components/StockNews";
import { usePortfolio } from "@/app/context/PortfolioContext";
import { ArrowLeft, PanelLeftClose, PanelLeftOpen, Loader2, Bell, Lightbulb, Eye } from "lucide-react";

interface Props {
  params: Promise<{ ticker: string }>;
}

export default function StockPage({ params }: Props) {
  const { ticker } = use(params);
  const upperTicker = ticker.toUpperCase();
  const { activePortfolioId } = usePortfolio();

  const [loading, setLoading] = useState(true);
  const [stock, setStock] = useState<Stock | null>(null);
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [evalVersion, setEvalVersion] = useState(0);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [backtestOpen, setBacktestOpen] = useState(false);
  const [edgeDraft, setEdgeDraft] = useState("");
  const [edgeSaving, setEdgeSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const stocks = await fetchStocks(activePortfolioId);
        const found = stocks.find((s) => s.ticker === upperTicker) ?? null;
        setStock(found);
        if (found?.edge_statement) setEdgeDraft(found.edge_statement);
        if (found) {
          const [t, e] = await Promise.all([
            getTheses(upperTicker, activePortfolioId).catch(() => [] as Thesis[]),
            getLatestEvaluation(upperTicker, activePortfolioId).catch(() => null),
          ]);
          setTheses(t);
          setEvaluation(e);
        }
      } catch { /* handled */ } finally { setLoading(false); }
    }
    load();
  }, [upperTicker, activePortfolioId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    );
  }

  if (!stock) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <p className="text-gray-400 dark:text-zinc-400 mb-4">Stock &quot;{upperTicker}&quot; not found.</p>
          <Link href="/" className="text-accent hover:text-accent-hover text-sm inline-flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" />Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 pt-4 pb-24 min-h-full">
      {/* Stock header */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="w-8 h-8 rounded-lg overflow-hidden bg-gray-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 border border-gray-200 dark:border-zinc-700">
          {stock.logo_url
            ? <img src={stock.logo_url} alt={stock.ticker} className="w-full h-full object-contain" />
            : <span className="text-xs font-bold text-gray-500 dark:text-zinc-400">{stock.ticker[0]}</span>}
        </div>
        <div>
          <h1 className="text-xl font-mono font-bold text-gray-900 dark:text-white leading-none">{stock.ticker}</h1>
          <p className="text-gray-400 dark:text-zinc-400 text-xs">{stock.name}</p>
        </div>
        {stock.watchlist === "true" && (
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
            title="Watchlist stocks don't count toward your portfolio score"
          >
            <Eye className="w-3 h-3" />
            Watchlist · not counted toward portfolio score
          </span>
        )}
      </div>

      {/* Quarterly review prompt */}
      {evaluation && (() => {
        const daysSince = Math.floor((Date.now() - new Date(evaluation.timestamp).getTime()) / 86400000);
        return daysSince >= 90 ? (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-xs">
            <Bell className="w-4 h-4 shrink-0" />
            <span>
              Last evaluated <strong>{daysSince} days ago</strong> — time for a quarterly review. Re-run the evaluation to see if your thesis still holds.
            </span>
          </div>
        ) : null;
      })()}

      {/* Layout: stacked on mobile, 2-column on lg+ */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left column — collapsible */}
        <div className={`flex-col gap-4 lg:shrink-0 transition-all duration-200 ${leftCollapsed ? "hidden lg:flex lg:w-8" : "flex w-full lg:w-[300px]"}`}>
          {leftCollapsed ? (
            <button
              onClick={() => setLeftCollapsed(false)}
              className="hidden lg:flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
              title="Expand panel"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-500 font-semibold">Info</span>
                <button
                  onClick={() => setLeftCollapsed(true)}
                  className="hidden lg:flex items-center justify-center w-6 h-6 rounded text-gray-400 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                  title="Collapse panel"
                >
                  <PanelLeftClose className="w-3.5 h-3.5" />
                </button>
              </div>
              <StockInfoPanel ticker={upperTicker} />
              <ScoreDeltaPanel ticker={upperTicker} portfolioId={activePortfolioId} evalVersion={evalVersion} />
              <ScoreHistoryChart ticker={upperTicker} />
              <div className="border border-gray-100 dark:border-zinc-800 rounded-xl overflow-hidden">
                <button
                  onClick={() => setBacktestOpen((v) => !v)}
                  title="Compare your conviction scores to actual forward price returns"
                  className="w-full flex items-center justify-between px-3 py-2 text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-500 font-semibold hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
                >
                  Conviction vs Returns
                  <span className="text-gray-300 dark:text-zinc-600">{backtestOpen ? "▲" : "▼"}</span>
                </button>
                {backtestOpen && (
                  <div className="px-3 pb-3">
                    <BacktestPanel ticker={upperTicker} portfolioId={activePortfolioId} />
                  </div>
                )}
              </div>
              <StockNews ticker={upperTicker} />
            </>
          )}
        </div>

        {/* Thesis column — centered with spacing when left is collapsed */}
        <div className={`min-w-0 ${leftCollapsed ? "flex-1 flex justify-center" : "flex-1"}`}>
          <div className={leftCollapsed ? "w-full max-w-3xl" : "w-full"}>
            {/* Articulate Your Edge */}
            <div className="mb-4 border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-3 bg-white dark:bg-zinc-900">
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="text-[11px] font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-widest">Your Edge</span>
              </div>
              <textarea
                value={edgeDraft}
                onChange={(e) => setEdgeDraft(e.target.value)}
                placeholder="What do you see that the market is missing?"
                rows={2}
                className="w-full text-sm text-gray-800 dark:text-zinc-200 bg-transparent border-none outline-none resize-none placeholder-gray-300 dark:placeholder-zinc-600 leading-relaxed"
              />
              {edgeDraft !== (stock?.edge_statement ?? "") && (
                <div className="flex justify-end mt-1">
                  <button
                    onClick={async () => {
                      setEdgeSaving(true);
                      try {
                        const updated = await updateEdgeStatement(upperTicker, edgeDraft, activePortfolioId);
                        setStock(updated);
                      } finally { setEdgeSaving(false); }
                    }}
                    disabled={edgeSaving}
                    className="text-xs px-3 py-1 rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
                  >
                    {edgeSaving ? "Saving..." : "Save"}
                  </button>
                </div>
              )}
            </div>

            <ThesisManager
              ticker={upperTicker}
              initialTheses={theses}
              initialEvaluation={evaluation}
              onEvaluationComplete={() => setEvalVersion((v) => v + 1)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
