"use client";

import { useState, useEffect, useCallback } from "react";
import {
  fetchStocks,
  getLatestEvaluation,
  getPortfolioTrends,
  getPortfolioScoreHistories,
  getPortfolioSparklines,
  type Stock,
  type Evaluation,
  type StockTrend,
  type EvaluationSummary,
} from "@/lib/api";
import { usePortfolio } from "@/app/context/PortfolioContext";
import PortfolioGauge from "./components/PortfolioGauge";
import PortfolioReturns from "./components/PortfolioReturns";
import MorningBriefing from "./components/MorningBriefing";
import EvaluateAllButton from "./components/EvaluateAllButton";
import PortfolioTable from "./components/PortfolioTable";
import AddStockInline from "./components/AddStockInline";
import SectorChart from "./components/SectorChart";
import PortfolioScoreTrend from "./components/PortfolioScoreTrend";
import OnboardingGuide from "./components/OnboardingGuide";
import PortfolioComparison from "./components/PortfolioComparison";
import WeeklyDigestCard from "./components/WeeklyDigest";
import EarningsCalendar from "./components/EarningsCalendar";
import ConvictionVsReturns from "./components/ConvictionVsReturns";
import QuizModal from "./components/QuizModal";
import ThesisOverviewPanel from "./components/ThesisOverviewPanel";
import { Loader2, GitCompare, Brain } from "lucide-react";

export default function DashboardPage() {
  const { activePortfolioId, portfolioLoaded } = usePortfolio();
  const [loading, setLoading] = useState(true);
  const [showComparison, setShowComparison] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [evaluations, setEvaluations] = useState<(Evaluation | null)[]>([]);
  const [trendMap, setTrendMap] = useState<Record<string, StockTrend>>({});
  const [scoreHistories, setScoreHistories] = useState<Record<string, EvaluationSummary[]>>({});
  const [priceSparklines, setPriceSparklines] = useState<Record<string, number[]>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const pid = activePortfolioId;
      const stockList = await fetchStocks(pid);
      setStocks(stockList);

      const [evals, trends, histories, sparklines] = await Promise.all([
        Promise.all(
          stockList.map((s) =>
            getLatestEvaluation(s.ticker, pid).catch(() => null)
          )
        ),
        getPortfolioTrends(pid).catch(() => [] as StockTrend[]),
        getPortfolioScoreHistories(10, pid).catch(() => ({}) as Record<string, EvaluationSummary[]>),
        getPortfolioSparklines(pid).catch(() => ({}) as Record<string, number[]>),
      ]);

      setEvaluations(evals);

      const tm: Record<string, StockTrend> = {};
      for (const t of trends) tm[t.ticker] = t;
      setTrendMap(tm);

      setScoreHistories(histories);
      setPriceSparklines(sparklines);
    } catch {
      // API errors handled per-call above
    } finally {
      setLoading(false);
    }
  }, [activePortfolioId]);

  useEffect(() => {
    if (portfolioLoaded) loadData();
  }, [portfolioLoaded, activePortfolioId, loadData]);

  const evaluatedScores = evaluations
    .filter((e): e is Evaluation => e !== null)
    .map((e) => e.score);

  const avgScore =
    evaluatedScores.length > 0
      ? evaluatedScores.reduce((sum, s) => sum + s, 0) / evaluatedScores.length
      : null;

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-6 pt-16 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="pb-24 min-h-full">
      {stocks.length > 0 ? (
        <>
          {/* Health gauge hero — dot-grid background */}
          <div className="dot-grid relative mb-6">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-transparent pointer-events-none" />
            <div className="relative max-w-5xl mx-auto px-6 pt-4">
              <PortfolioGauge avgScore={avgScore ?? 0} hasEvaluations={avgScore !== null} />
            </div>
          </div>

          <div className="max-w-5xl mx-auto px-6">
            {/* Two-column: left = news, right = returns + sector */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 mb-6">
              <div className="min-w-0">
                <MorningBriefing portfolioId={activePortfolioId} />
              </div>
              <div className="flex flex-col gap-4 min-w-0">
                <PortfolioReturns portfolioId={activePortfolioId} />
                <SectorChart compact portfolioId={activePortfolioId} />
                <PortfolioScoreTrend scoreHistories={scoreHistories} />
                <WeeklyDigestCard portfolioId={activePortfolioId} />
                <EarningsCalendar />
                <ConvictionVsReturns />
                <ThesisOverviewPanel portfolioId={activePortfolioId} />
              </div>
            </div>

            {/* Stocks header + table */}
            <div className="border-t border-gray-100 dark:border-zinc-800 pt-4 mb-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Portfolio Stocks</h2>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowQuiz(true)}
                    title="Quiz yourself on your thesis"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200 rounded-lg border border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors">
                    <Brain className="w-3.5 h-3.5" />
                    Quiz
                  </button>
                  <button
                    onClick={() => setShowComparison(true)}
                    title="Compare portfolios"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200 rounded-lg border border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors">
                    <GitCompare className="w-3.5 h-3.5" />
                    Compare
                  </button>
                  <EvaluateAllButton portfolioId={activePortfolioId} />
                  <AddStockInline onAdded={loadData} portfolioId={activePortfolioId} />
                </div>
              </div>
            </div>

            <PortfolioTable
              stocks={stocks}
              evaluations={evaluations}
              trendMap={trendMap}
              scoreHistories={scoreHistories}
              priceSparklines={priceSparklines}
              onStockUpdated={(updated) => setStocks((prev) => prev.map((s) => s.ticker === updated.ticker ? updated : s))}
            />
          </div>
        </>
      ) : (
        <div className="max-w-5xl mx-auto">
          <OnboardingGuide onAdded={loadData} portfolioId={activePortfolioId} />
        </div>
      )}

      {showComparison && <PortfolioComparison onClose={() => setShowComparison(false)} />}
      {showQuiz && <QuizModal portfolioId={activePortfolioId} onClose={() => setShowQuiz(false)} />}
    </div>
  );
}
