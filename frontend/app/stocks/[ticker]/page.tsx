import Link from "next/link";
import { getTheses, getLatestEvaluation, type Thesis, type Evaluation } from "@/lib/api";
import ThesisManager from "./ThesisManager";
import DeleteStockButton from "@/app/components/DeleteStockButton";
import StockInfoPanel from "@/app/components/StockInfoPanel";
import ScoreHistoryChart from "@/app/components/ScoreHistoryChart";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

async function getStock(ticker: string) {
  const res = await fetch(`${BASE_URL}/stocks/${ticker}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json() as Promise<{ id: number; ticker: string; name: string; logo_url: string | null }>;
}

interface Props {
  params: Promise<{ ticker: string }>;
}

export default async function StockPage({ params }: Props) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();

  const stock = await getStock(upperTicker);
  if (!stock) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-400 mb-4">Stock &quot;{upperTicker}&quot; not found.</p>
          <Link href="/" className="text-blue-400 hover:text-blue-300 text-sm">
            ← Back to Portfolio
          </Link>
        </div>
      </div>
    );
  }

  let theses: Thesis[] = [];
  let evaluation: Evaluation | null = null;

  try {
    theses = await getTheses(upperTicker);
  } catch {
    // none yet
  }

  try {
    evaluation = await getLatestEvaluation(upperTicker);
  } catch {
    // none yet
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Breadcrumb */}
        <Link
          href="/"
          className="text-zinc-600 hover:text-zinc-400 text-sm mb-8 inline-block transition-colors"
        >
          ← Portfolio
        </Link>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-800 flex items-center justify-center shrink-0">
              {stock.logo_url ? (
                <img src={stock.logo_url} alt={stock.ticker} className="w-full h-full object-contain" />
              ) : (
                <span className="text-sm font-bold text-zinc-400">{stock.ticker[0]}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-mono font-bold text-white leading-none">{stock.ticker}</h1>
              <p className="text-zinc-400 text-sm truncate">{stock.name}</p>
            </div>
            <div className="ml-auto">
              <DeleteStockButton ticker={stock.ticker} redirectTo="/" />
            </div>
          </div>
        </div>

        {/* 2-column layout: chart/info on left, thesis on right */}
        <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-10 items-start">
          {/* Left: stock info + chart (sticky on scroll) */}
          <div className="md:sticky md:top-8 flex flex-col gap-4 min-w-0">
            <StockInfoPanel ticker={upperTicker} />
            <ScoreHistoryChart ticker={upperTicker} />
          </div>

          {/* Right: thesis manager */}
          <div>
            <ThesisManager
              ticker={upperTicker}
              initialTheses={theses}
              initialEvaluation={evaluation}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
