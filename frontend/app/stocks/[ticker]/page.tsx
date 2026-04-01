"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import {
  fetchStocks,
  getTheses,
  getLatestEvaluation,
  type Stock,
  type Thesis,
  type Evaluation,
} from "@/lib/api";
import ThesisManager from "./ThesisManager";
import StockDetailLayout from "./StockDetailLayout";
import StockInfoPanel from "@/app/components/StockInfoPanel";
import ScoreHistoryChart from "@/app/components/ScoreHistoryChart";
import StockNews from "@/app/components/StockNews";
import { ArrowLeft, Loader2 } from "lucide-react";

interface Props {
  params: Promise<{ ticker: string }>;
}

export default function StockPage({ params }: Props) {
  const { ticker } = use(params);
  const upperTicker = ticker.toUpperCase();

  const [loading, setLoading] = useState(true);
  const [stock, setStock] = useState<Stock | null>(null);
  const [theses, setTheses] = useState<Thesis[]>([]);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);

  useEffect(() => {
    async function load() {
      try {
        // Fetch stock from the list (scoped by user via token)
        const stocks = await fetchStocks();
        const found = stocks.find((s) => s.ticker === upperTicker) ?? null;
        setStock(found);

        if (found) {
          const [t, e] = await Promise.all([
            getTheses(upperTicker).catch(() => [] as Thesis[]),
            getLatestEvaluation(upperTicker).catch(() => null),
          ]);
          setTheses(t);
          setEvaluation(e);
        }
      } catch {
        // handled
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [upperTicker]);

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
          <p className="text-zinc-400 mb-4">Stock &quot;{upperTicker}&quot; not found.</p>
          <Link href="/" className="text-accent hover:text-accent-hover text-sm inline-flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-3 flex flex-col h-[calc(100vh-48px)] overflow-hidden">
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
