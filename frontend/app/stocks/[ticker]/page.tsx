import Link from "next/link";
import { getTheses, getLatestEvaluation, type Thesis, type Evaluation } from "@/lib/api";
import ThesisManager from "./ThesisManager";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

async function getStock(ticker: string) {
  const res = await fetch(`${BASE_URL}/stocks/${ticker}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json() as Promise<{ id: number; ticker: string; name: string }>;
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
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Breadcrumb */}
        <Link
          href="/"
          className="text-zinc-600 hover:text-zinc-400 text-sm mb-8 inline-block transition-colors"
        >
          ← Portfolio
        </Link>

        {/* Header */}
        <div className="mb-10">
          <div className="flex items-baseline gap-3 mb-1">
            <h1 className="text-2xl font-mono font-bold text-white">{stock.ticker}</h1>
            <span className="text-zinc-400">{stock.name}</span>
          </div>
          <p className="text-zinc-600 text-sm">
            Select the thesis points you believe in, then evaluate.
          </p>
        </div>

        {/* Thesis Manager (client component handles all interactivity) */}
        <ThesisManager
          ticker={upperTicker}
          initialTheses={theses}
          initialEvaluation={evaluation}
        />
      </div>
    </div>
  );
}
