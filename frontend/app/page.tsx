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
import PortfolioGauge from "./components/PortfolioGauge";
import PortfolioReturns from "./components/PortfolioReturns";
import MorningBriefing from "./components/MorningBriefing";
import EvaluateAllButton from "./components/EvaluateAllButton";
import PortfolioTable from "./components/PortfolioTable";
import AddStockInline from "./components/AddStockInline";
import SectorChart from "./components/SectorChart";
import { Loader2 } from "lucide-react";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [evaluations, setEvaluations] = useState<(Evaluation | null)[]>([]);
  const [trendMap, setTrendMap] = useState<Record<string, StockTrend>>({});
  const [scoreHistories, setScoreHistories] = useState<Record<string, EvaluationSummary[]>>({});
  const [priceSparklines, setPriceSparklines] = useState<Record<string, number[]>>({});

  const loadData = useCallback(async () => {
    try {
      const stockList = await fetchStocks();
      setStocks(stockList);

      const [evals, trends, histories, sparklines] = await Promise.all([
        Promise.all(
          stockList.map((s) =>
            getLatestEvaluation(s.ticker).catch(() => null)
          )
        ),
        getPortfolioTrends().catch(() => [] as StockTrend[]),
        getPortfolioScoreHistories(10).catch(() => ({}) as Record<string, EvaluationSummary[]>),
        getPortfolioSparklines().catch(() => ({}) as Record<string, number[]>),
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
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
    <div className="max-w-5xl mx-auto px-6 pt-2 pb-4">
      {/* Health gauge — full width at top */}
      <PortfolioGauge avgScore={avgScore ?? 0} hasEvaluations={avgScore !== null} />

      {stocks.length > 0 ? (
        <>
          {/* Two-column: left = news, right = returns + sector */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 mb-6">
            <div className="min-w-0">
              <MorningBriefing />
            </div>
            <div className="flex flex-col gap-4">
              <PortfolioReturns />
              <SectorChart compact />
            </div>
          </div>

          {/* Stocks header + table */}
          <div className="border-t border-zinc-800 pt-4 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs uppercase tracking-widest text-zinc-500 font-semibold">Portfolio Stocks</h2>
              <div className="flex items-center gap-3">
                <EvaluateAllButton />
                <AddStockInline onAdded={loadData} />
              </div>
            </div>
          </div>

          <PortfolioTable
            stocks={stocks}
            evaluations={evaluations}
            trendMap={trendMap}
            scoreHistories={scoreHistories}
            priceSparklines={priceSparklines}
          />
        </>
      ) : (
        <div className="text-center py-16">
          <p className="text-zinc-500 text-sm mb-4">No stocks in your portfolio yet.</p>
          <AddStockInline onAdded={loadData} />
        </div>
      )}
    </div>
  );
}
