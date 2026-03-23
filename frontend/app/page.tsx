import Link from "next/link";
import { fetchStocks, getLatestEvaluation, type Stock, type Evaluation } from "@/lib/api";
import AddStockForm from "./components/AddStockForm";
import StatusBadge from "./components/StatusBadge";
import DeleteStockButton from "./components/DeleteStockButton";

async function getEvaluationSafe(ticker: string): Promise<Evaluation | null> {
  try {
    return await getLatestEvaluation(ticker);
  } catch {
    return null;
  }
}

function PortfolioGauge({ avgScore }: { avgScore: number }) {
  const cx = 100, cy = 100, r = 80, needleLen = 65;

  function arcPt(score: number): [number, number] {
    const a = (1 - score / 100) * Math.PI;
    return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
  }

  const [x0, y0] = arcPt(0);
  const [x50, y50] = arcPt(50);
  const [x75, y75] = arcPt(75);
  const [x100, y100] = arcPt(100);

  const angle = (1 - avgScore / 100) * Math.PI;
  const nx = cx + needleLen * Math.cos(angle);
  const ny = cy - needleLen * Math.sin(angle);

  const color = avgScore >= 75 ? "#22c55e" : avgScore >= 50 ? "#eab308" : "#ef4444";
  const label = avgScore >= 75 ? "Thesis Strong" : avgScore >= 50 ? "Under Pressure" : "At Risk";

  const fmt = (n: number) => n.toFixed(2);

  return (
    <div className="flex flex-col items-center py-6 mb-8 bg-zinc-900 border border-zinc-800 rounded-xl">
      <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">
        Portfolio Thesis Health
      </p>
      <svg viewBox="0 0 200 105" width="200" height="105">
        {/* Background track */}
        <path
          d={`M ${fmt(x0)} ${fmt(y0)} A ${r} ${r} 0 0 0 ${fmt(x100)} ${fmt(y100)}`}
          fill="none" stroke="#27272a" strokeWidth="14" strokeLinecap="round"
        />
        {/* Red zone: 0–50 */}
        <path
          d={`M ${fmt(x0)} ${fmt(y0)} A ${r} ${r} 0 0 0 ${fmt(x50)} ${fmt(y50)}`}
          fill="none" stroke="#7f1d1d" strokeWidth="14" strokeLinecap="round"
        />
        {/* Yellow zone: 50–75 */}
        <path
          d={`M ${fmt(x50)} ${fmt(y50)} A ${r} ${r} 0 0 0 ${fmt(x75)} ${fmt(y75)}`}
          fill="none" stroke="#713f12" strokeWidth="14" strokeLinecap="round"
        />
        {/* Green zone: 75–100 */}
        <path
          d={`M ${fmt(x75)} ${fmt(y75)} A ${r} ${r} 0 0 0 ${fmt(x100)} ${fmt(y100)}`}
          fill="none" stroke="#14532d" strokeWidth="14" strokeLinecap="round"
        />
        {/* Needle */}
        <line
          x1={cx} y1={cy}
          x2={fmt(nx)} y2={fmt(ny)}
          stroke={color} strokeWidth="2.5" strokeLinecap="round"
        />
        {/* Pivot dot */}
        <circle cx={cx} cy={cy} r="5" fill={color} />
        {/* Zone labels */}
        <text x="18" y="108" fill="#7f1d1d" fontSize="9" textAnchor="middle">0</text>
        <text x="100" y="16" fill="#713f12" fontSize="9" textAnchor="middle">50</text>
        <text x="182" y="108" fill="#14532d" fontSize="9" textAnchor="middle">100</text>
      </svg>
      <div className="text-center -mt-1">
        <span className="text-3xl font-mono font-bold text-white">{avgScore.toFixed(1)}</span>
        <span className="text-zinc-500 text-sm">/100</span>
        <p className="text-xs mt-1 font-medium" style={{ color }}>{label}</p>
      </div>
    </div>
  );
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
