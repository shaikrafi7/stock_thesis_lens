import Link from "next/link";
import { fetchStocks, getLatestEvaluation, type Stock, type Evaluation } from "@/lib/api";
import AddStockForm from "./components/AddStockForm";
import StatusBadge from "./components/StatusBadge";
import DeleteStockButton from "./components/DeleteStockButton";
import PortfolioGauge from "./components/PortfolioGauge";

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

  const evaluations = await Promise.all(
    stocks.map((s) => getEvaluationSafe(s.ticker))
  );

  const evaluatedScores = evaluations
    .filter((e): e is Evaluation => e !== null)
    .map((e) => e.score);

  const avgScore =
    evaluatedScores.length > 0
      ? evaluatedScores.reduce((sum, s) => sum + s, 0) / evaluatedScores.length
      : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-2xl font-semibold tracking-tight text-white mb-1">
            Stock Thesis Lens
          </h1>
          <p className="text-zinc-500 text-sm">
            Is my investment thesis still valid?
          </p>
        </div>

        {/* Portfolio Gauge */}
        {avgScore !== null && <PortfolioGauge avgScore={avgScore} />}

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
          <h2 className="text-xs uppercase tracking-widest text-zinc-500 mb-3">
            Portfolio ({stocks.length})
          </h2>

          {stocks.length === 0 ? (
            <p className="text-zinc-600 text-sm">
              No stocks yet. Add a ticker above to get started.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {stocks.map((stock, i) => {
                const evaluation = evaluations[i];
                return (
                  <div
                    key={stock.ticker}
                    className="flex items-center justify-between px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-zinc-600 transition-colors group"
                  >
                    <Link
                      href={`/stocks/${stock.ticker}`}
                      className="flex items-center gap-4 flex-1 min-w-0"
                    >
                      <div className="w-8 h-8 rounded shrink-0 overflow-hidden bg-zinc-800 flex items-center justify-center">
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
          )}
        </div>
      </div>
    </div>
  );
}
