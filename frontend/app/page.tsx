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

async function getEvaluationSafe(ticker: string): Promise<Evaluation | null> {
  try {
    return await getLatestEvaluation(ticker);
  } catch {
    return null;
  }
}

async function safeFetch<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export default async function DashboardPage() {
  let stocks: Stock[] = [];
  try {
    stocks = await fetchStocks();
  } catch {
    // backend may not be running yet
  }

  const [evaluations, trends, scoreHistories, priceSparklines] = await Promise.all([
    Promise.all(stocks.map((s) => getEvaluationSafe(s.ticker))),
    safeFetch(getPortfolioTrends, [] as StockTrend[]),
    safeFetch(() => getPortfolioScoreHistories(10), {} as Record<string, EvaluationSummary[]>),
    safeFetch(getPortfolioSparklines, {} as Record<string, number[]>),
  ]);

  const trendMap: Record<string, StockTrend> = {};
  for (const t of trends) {
    trendMap[t.ticker] = t;
  }

  const evaluatedScores = evaluations
    .filter((e): e is Evaluation => e !== null)
    .map((e) => e.score);

  const avgScore =
    evaluatedScores.length > 0
      ? evaluatedScores.reduce((sum, s) => sum + s, 0) / evaluatedScores.length
      : null;

  return (
    <div className="max-w-5xl mx-auto px-6 pt-2 pb-4">
      {/* Health gauge — full width hero */}
      {avgScore !== null && <PortfolioGauge avgScore={avgScore} />}

      {stocks.length > 0 ? (
        <>
          {/* Two-column: briefing (left) | returns gauge (right) */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 mb-6">
            <div className="min-w-0">
              <MorningBriefing />
            </div>
            <div className="lg:sticky lg:top-0 lg:self-start">
              <PortfolioReturns />
            </div>
          </div>

          {/* Portfolio header with actions */}
          <div className="border-t border-zinc-800 pt-4 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs uppercase tracking-widest text-zinc-500 font-semibold">Portfolio Stocks</h2>
              <div className="flex items-center gap-3">
                <EvaluateAllButton />
                <AddStockInline />
              </div>
            </div>
          </div>

          {/* Stock list */}
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
          <AddStockInline />
        </div>
      )}
    </div>
  );
}
