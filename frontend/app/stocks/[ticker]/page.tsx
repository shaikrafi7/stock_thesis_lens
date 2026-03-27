import Link from "next/link";
import { getTheses, getLatestEvaluation, type Thesis, type Evaluation } from "@/lib/api";
import ThesisManager from "./ThesisManager";
import StockDetailLayout from "./StockDetailLayout";
import StockInfoPanel from "@/app/components/StockInfoPanel";
import ScoreHistoryChart from "@/app/components/ScoreHistoryChart";
import StockNews from "@/app/components/StockNews";
import { ArrowLeft } from "lucide-react";

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
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <p className="text-zinc-400 mb-4">Stock &quot;{upperTicker}&quot; not found.</p>
          <Link href="/" className="text-accent hover:text-accent-hover text-sm inline-flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
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
    <div className="max-w-7xl mx-auto px-6 py-3">
      {/* Breadcrumb + Header compact */}
      <div className="flex items-center gap-3 mb-4">
        <Link
          href="/"
          className="text-zinc-600 hover:text-zinc-400 transition-colors shrink-0"
          title="Back to Dashboard"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="w-8 h-8 rounded-lg overflow-hidden bg-surface flex items-center justify-center shrink-0 border border-zinc-800">
          {stock.logo_url ? (
            <img src={stock.logo_url} alt={stock.ticker} className="w-full h-full object-contain" />
          ) : (
            <span className="text-xs font-bold text-zinc-400">{stock.ticker[0]}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-mono font-bold text-white leading-none">{stock.ticker}</h1>
          <p className="text-zinc-400 text-xs truncate">{stock.name}</p>
        </div>
      </div>

      {/* Collapsible layout: left panel (chart/metrics/news) + center (thesis) */}
      <StockDetailLayout
        leftPanel={
          <>
            <StockInfoPanel ticker={upperTicker} />
            <ScoreHistoryChart ticker={upperTicker} />
            <StockNews ticker={upperTicker} />
          </>
        }
        centerPanel={
          <ThesisManager
            ticker={upperTicker}
            initialTheses={theses}
            initialEvaluation={evaluation}
          />
        }
      />
    </div>
  );
}
