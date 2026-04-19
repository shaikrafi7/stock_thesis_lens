"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  fetchStocks,
  getPortfolioEvaluations,
  getPortfolioTrends,
  getPortfolioScoreHistories,
  getPortfolioSparklines,
  getPortfolioPrices,
  getPortfolioGuidance,
  type Stock,
  type Evaluation,
  type StockTrend,
  type EvaluationSummary,
  type PriceSnapshot,
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
import JournalContent from "./journal/JournalContent";
import { Loader2, GitCompare, Brain, Lightbulb, LineChart, BarChart3, BookOpen } from "lucide-react";

type TabKey = "stocks" | "insights" | "journal";
const TAB_ORDER: TabKey[] = ["stocks", "insights", "journal"];
const TABS: Array<{ key: TabKey; label: string; Icon: typeof LineChart }> = [
  { key: "stocks", label: "Stocks", Icon: LineChart },
  { key: "insights", label: "Insights", Icon: BarChart3 },
  { key: "journal", label: "Journal", Icon: BookOpen },
];

function parseTab(raw: string | null): TabKey {
  return TAB_ORDER.includes(raw as TabKey) ? (raw as TabKey) : "stocks";
}

function DashboardInner() {
  const { activePortfolioId, portfolioLoaded } = usePortfolio();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));

  const setTab = (next: TabKey) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "stocks") params.delete("tab");
    else params.set("tab", next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const [loading, setLoading] = useState(true);
  const [showComparison, setShowComparison] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [evaluations, setEvaluations] = useState<(Evaluation | null)[]>([]);
  const [trendMap, setTrendMap] = useState<Record<string, StockTrend>>({});
  const [scoreHistories, setScoreHistories] = useState<Record<string, EvaluationSummary[]>>({});
  const [priceSparklines, setPriceSparklines] = useState<Record<string, number[]>>({});
  const [priceSnapshots, setPriceSnapshots] = useState<Record<string, PriceSnapshot>>({});
  const [guidance, setGuidance] = useState<string[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const pid = activePortfolioId;
      const stockList = await fetchStocks(pid);
      setStocks(stockList);

      const [evalMap, trends, histories, sparklines, prices, guidanceRes] = await Promise.all([
        getPortfolioEvaluations(pid).catch(() => ({}) as Record<string, Evaluation>),
        getPortfolioTrends(pid).catch(() => [] as StockTrend[]),
        getPortfolioScoreHistories(10, pid).catch(() => ({}) as Record<string, EvaluationSummary[]>),
        getPortfolioSparklines(pid).catch(() => ({}) as Record<string, number[]>),
        getPortfolioPrices(pid).catch(() => ({}) as Record<string, PriceSnapshot>),
        getPortfolioGuidance(pid).catch(() => ({ guidance: [] })),
      ]);

      const evals = stockList.map((s) => evalMap[s.ticker] ?? null);
      setEvaluations(evals);

      const tm: Record<string, StockTrend> = {};
      for (const t of trends) tm[t.ticker] = t;
      setTrendMap(tm);

      setScoreHistories(histories);
      setPriceSparklines(sparklines);
      setPriceSnapshots(prices);
      setGuidance(guidanceRes.guidance);
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

  if (stocks.length === 0) {
    return (
      <div className="pb-24 min-h-full">
        <div className="max-w-5xl mx-auto">
          <OnboardingGuide onAdded={loadData} portfolioId={activePortfolioId} />
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24 min-h-full">
      {/* Tab bar */}
      <div className="max-w-5xl mx-auto px-6 pt-4">
        <nav className="flex items-center gap-1 border-b border-gray-200 dark:border-zinc-800" role="tablist" aria-label="Dashboard sections">
          {TABS.map(({ key, label, Icon }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(key)}
                className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  active
                    ? "border-accent text-accent"
                    : "border-transparent text-gray-500 dark:text-zinc-400 hover:text-gray-800 dark:hover:text-zinc-200"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            );
          })}
        </nav>
      </div>

      {tab === "stocks" && (
        <>
          {/* Health gauge hero — dot-grid background */}
          <div className="dot-grid relative mb-6 mt-2">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-transparent pointer-events-none" />
            <div className="relative max-w-5xl mx-auto px-6 pt-4">
              <PortfolioGauge avgScore={avgScore ?? 0} hasEvaluations={avgScore !== null} />
            </div>
          </div>

          <div className="max-w-5xl mx-auto px-6">
            {/* Guidance strip */}
            {guidance.length > 0 && (
              <div className="mb-6 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 flex flex-col gap-2">
                {guidance.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-200">
                    <Lightbulb className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Morning briefing full width */}
            <div className="mb-6">
              <MorningBriefing portfolioId={activePortfolioId} />
            </div>

            {/* Stocks header + table */}
            <div className="border-t border-gray-100 dark:border-zinc-800 pt-4 mb-4">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h2 className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Portfolio Stocks</h2>
                <div className="flex items-center gap-3 flex-wrap">
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
              priceSnapshots={priceSnapshots}
              onStockUpdated={(updated) => setStocks((prev) => prev.map((s) => s.ticker === updated.ticker ? updated : s))}
            />
          </div>
        </>
      )}

      {tab === "insights" && (
        <div className="max-w-5xl mx-auto px-6 pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PortfolioReturns portfolioId={activePortfolioId} />
            <SectorChart compact portfolioId={activePortfolioId} />
            <PortfolioScoreTrend scoreHistories={scoreHistories} />
            <WeeklyDigestCard portfolioId={activePortfolioId} />
            <EarningsCalendar />
            <ConvictionVsReturns scoreHistories={scoreHistories} />
            <div className="md:col-span-2">
              <ThesisOverviewPanel portfolioId={activePortfolioId} />
            </div>
          </div>
        </div>
      )}

      {tab === "journal" && <JournalContent showHeader={false} />}

      {showComparison && <PortfolioComparison onClose={() => setShowComparison(false)} />}
      {showQuiz && <QuizModal portfolioId={activePortfolioId} onClose={() => setShowQuiz(false)} />}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="max-w-5xl mx-auto px-6 pt-16 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    }>
      <DashboardInner />
    </Suspense>
  );
}
