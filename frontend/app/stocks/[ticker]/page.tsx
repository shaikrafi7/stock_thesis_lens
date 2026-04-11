"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import {
  fetchStocks, getTheses, getLatestEvaluation,
  type Stock, type Thesis, type Evaluation,
} from "@/lib/api";
import ThesisManager from "./ThesisManager";
import StockInfoPanel from "@/app/components/StockInfoPanel";
import ScoreHistoryChart from "@/app/components/ScoreHistoryChart";
import ScoreDeltaPanel from "@/app/components/ScoreDelta";
import StockNews from "@/app/components/StockNews";
import { usePortfolio } from "@/app/context/PortfolioContext";
import { ArrowLeft, PanelLeftClose, PanelLeftOpen, Loader2, Bell } from "lucide-react";

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

  useEffect(() => {
    async function load() {
      try {
        const stocks = await fetchStocks(activePortfolioId);
        const found = stocks.find((s) => s.ticker === upperTicker) ?? null;
        setStock(found);
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
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg overflow-hidden bg-gray-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 border border-gray-200 dark:border-zinc-700">
          {stock.logo_url
            ? <img src={stock.logo_url} alt={stock.ticker} className="w-full h-full object-contain" />
            : <span className="text-xs font-bold text-gray-500 dark:text-zinc-400">{stock.ticker[0]}</span>}
        </div>
        <div>
          <h1 className="text-xl font-mono font-bold text-gray-900 dark:text-white leading-none">{stock.ticker}</h1>
          <p className="text-gray-400 dark:text-zinc-400 text-xs">{stock.name}</p>
        </div>
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
              <StockNews ticker={upperTicker} />
            </>
          )}
        </div>

        {/* Thesis column — centered with spacing when left is collapsed */}
        <div className={`min-w-0 ${leftCollapsed ? "flex-1 flex justify-center" : "flex-1"}`}>
          <div className={leftCollapsed ? "w-full max-w-3xl" : "w-full"}>
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
