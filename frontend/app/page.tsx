import { fetchStocks, getLatestEvaluation, getPortfolioTrends, getPortfolioScoreHistories, type Stock, type Evaluation, type StockTrend } from "@/lib/api";
import AddStockForm from "./components/AddStockForm";
import PortfolioGauge from "./components/PortfolioGauge";
import MorningBriefing from "./components/MorningBriefing";
import EvaluateAllButton from "./components/EvaluateAllButton";
import PortfolioTable from "./components/PortfolioTable";

async function getEvaluationSafe(ticker: string): Promise<Evaluation | null> {
  try {
    return await getLatestEvaluation(ticker);
  } catch {
    return null;
  }
}


export default async function DashboardPage() {
  let stocks: Stock[] = [];
  try {
    stocks = await fetchStocks();
  } catch {
    // backend may not be running yet
  }

  const [evaluations, trends, scoreHistories] = await Promise.all([
    Promise.all(stocks.map((s) => getEvaluationSafe(s.ticker))),
    getPortfolioTrends().catch(() => [] as StockTrend[]),
    getPortfolioScoreHistories(10).catch(() => ({} as Record<string, never>)),
  ]);
  const trendMap: Record<string, StockTrend> = {};
  for (const t of trends) trendMap[t.ticker] = t;

  const evaluatedScores = evaluations
    .filter((e): e is Evaluation => e !== null)
    .map((e) => e.score);

  const avgScore =
    evaluatedScores.length > 0
      ? evaluatedScores.reduce((sum, s) => sum + s, 0) / evaluatedScores.length
      : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10 flex items-center gap-3">
          <img src="/thesisarc-logo.png" alt="ThesisArc" className="h-9 w-auto" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight mb-0.5">
              <span className="text-white">Thesis</span><span className="text-accent">Arc</span>
            </h1>
            <p className="text-zinc-500 text-sm">
              The arc of conviction, stress-tested daily
            </p>
          </div>
        </div>

        {/* Portfolio Gauge */}
        {avgScore !== null && <PortfolioGauge avgScore={avgScore} />}

        {/* Morning Briefing */}
        {stocks.length > 0 && <MorningBriefing />}

        {/* Add Stock */}
        <div className="mb-10">
          <h2 className="text-xs uppercase tracking-widest text-zinc-500 mb-3">
            Add to Portfolio
          </h2>
          <AddStockForm />
          <p className="text-zinc-600 text-xs mt-2">
            Enter a ticker symbol (e.g. AAPL) — company name is looked up automatically.
          </p>
        </div>

        {/* Portfolio */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs uppercase tracking-widest text-zinc-500">
              Portfolio ({stocks.length})
            </h2>
            {stocks.length > 0 && <EvaluateAllButton />}
          </div>

          {stocks.length === 0 ? (
            <p className="text-zinc-600 text-sm">
              No stocks yet. Add a ticker above to get started.
            </p>
          ) : (
            <PortfolioTable
              stocks={stocks}
              evaluations={evaluations}
              trendMap={trendMap}
              scoreHistories={scoreHistories}
            />
          )}
        </div>
      </div>
    </div>
  );
}
