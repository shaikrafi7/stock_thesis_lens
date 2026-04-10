"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import {
  fetchStocks, getTheses, getLatestEvaluation,
  type Stock, type Thesis, type Evaluation,
} from "@/lib/api";
import ThesisManager from "./ThesisManager";
import StockInfoPanel from "@/app/components/StockInfoPanel";
import ScoreHistoryChart from "@/app/components/ScoreHistoryChart";
import StockNews from "@/app/components/StockNews";
import { usePortfolio } from "@/app/context/PortfolioContext";
import { ArrowLeft, Loader2 } from "lucide-react";

interface Props {
  params: Promise<{ ticker: string }>;
}

export default function StockPage({ params }: Props) {
  const { ticker } = use(params);
  const upperTicker = ticker.toUpperCase();
  const { activePortfolioId } = usePortfolio();

  const [loading, setLoading] = useState(true);
  const [stock, setStock] = useState<Stock | null>(null);
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const stocks = await fetchStocks(activePortfolioId);
        const found = stocks.find((s) => s.ticker === upperTicker) ?? null;
        setStock(found);
        if (found) {
          const [t, e] = await Promise.all([
            getTheses(upperTicker, activePortfolioId).catch(() => [] as Thesis[]),
            getLatestEvaluation(upperTicker, activePortfolioId).catch(() => null),
          ]);
          setTheses(t);
          setEvaluation(e);
        }
      } catch { /* handled */ } finally { setLoading(false); }
    }
    load();
  }, [upperTicker, activePortfolioId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    );
  }

  if (!stock) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <p className="text-gray-400 dark:text-zinc-400 mb-4">Stock &quot;{upperTicker}&quot; not found.</p>
          <Link href="/" className="text-accent hover:text-accent-hover text-sm inline-flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" />Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 pt-4 pb-6 min-h-full">
      {/* Stock header */}
      <div className="flex items-center gap-3 mb-4">
        <Link href="/" className="text-gray-400 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-300 transition-colors shrink-0" title="Back to Dashboard">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="w-8 h-8 rounded-lg overflow-hidden bg-gray-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 border border-gray-200 dark:border-zinc-700">
          {stock.logo_url
            ? <img src={stock.logo_url} alt={stock.ticker} className="w-full h-full object-contain" />
            : <span className="text-xs font-bold text-gray-500 dark:text-zinc-400">{stock.ticker[0]}</span>}
        </div>
        <div>
          <h1 className="text-xl font-mono font-bold text-gray-900 dark:text-white leading-none">{stock.ticker}</h1>
          <p className="text-gray-400 dark:text-zinc-400 text-xs">{stock.name}</p>
        </div>
      </div>

      {/* 2-column layout: left panel + thesis */}
      <div className="flex gap-6">
        {/* Left column — fixed width */}
        <div className="w-[300px] shrink-0 flex flex-col gap-4">
          <StockInfoPanel ticker={upperTicker} />
          <ScoreHistoryChart ticker={upperTicker} />
          <StockNews ticker={upperTicker} />
        </div>

        {/* Center column — thesis takes remaining space */}
        <div className="flex-1 min-w-0">
          <ThesisManager
            ticker={upperTicker}
            initialTheses={theses}
            initialEvaluation={evaluation}
          />
        </div>
      </div>
    </div>
  );
}
