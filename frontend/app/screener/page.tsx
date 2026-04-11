"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getScreener, addStock, type ScreenerCard } from "@/lib/api";
import { usePortfolio } from "@/app/context/PortfolioContext";
import { Loader2, RefreshCw, Plus, Star, TrendingUp, TrendingDown, Minus, ChevronRight } from "lucide-react";

const RATING_LABEL: Record<string, string> = {
  strongbuy: "Strong Buy",
  buy: "Buy",
  hold: "Hold",
  underperform: "Underperform",
  sell: "Sell",
};

const RATING_COLOR: Record<string, string> = {
  strongbuy: "text-emerald-600 dark:text-emerald-400",
  buy: "text-green-600 dark:text-green-400",
  hold: "text-amber-500",
  underperform: "text-orange-500",
  sell: "text-red-500",
};

function ChangeChip({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const pos = pct >= 0;
  const Icon = pct === 0 ? Minus : pos ? TrendingUp : TrendingDown;
  return (
    <span className={`flex items-center gap-0.5 text-[11px] font-mono font-semibold ${pos ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
      <Icon className="w-3 h-3" />
      {pos ? "+" : ""}{pct.toFixed(2)}%
    </span>
  );
}

function CardItem({ card, onAdd, onWatchlist }: {
  card: ScreenerCard;
  onAdd: (ticker: string) => Promise<void>;
  onWatchlist: (ticker: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [watching, setWatching] = useState(false);
  const [added, setAdded] = useState(card.in_portfolio);
  const [watched, setWatched] = useState(card.in_watchlist);

  async function handleAdd() {
    setAdding(true);
    try { await onAdd(card.ticker); setAdded(true); } catch { /* silent */ } finally { setAdding(false); }
  }

  async function handleWatch() {
    setWatching(true);
    try { await onWatchlist(card.ticker); setWatched(true); } catch { /* silent */ } finally { setWatching(false); }
  }

  return (
    <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-4 flex flex-col gap-3 hover:border-gray-300 dark:hover:border-zinc-700 transition-colors">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Link href={`/stocks/${card.ticker}`} className="font-mono font-bold text-sm text-accent hover:underline">
              {card.ticker}
            </Link>
            {card.analyst_rating && (
              <span className={`text-[10px] font-semibold ${RATING_COLOR[card.analyst_rating] ?? "text-gray-400"}`}>
                {RATING_LABEL[card.analyst_rating] ?? card.analyst_rating}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-zinc-400 leading-snug line-clamp-1">{card.name}</p>
          {card.sector && <p className="text-[10px] text-gray-400 dark:text-zinc-600 mt-0.5">{card.sector}</p>}
        </div>
        <div className="text-right shrink-0 ml-2">
          {card.price !== null && (
            <p className="text-sm font-mono font-semibold text-gray-800 dark:text-zinc-200">${card.price.toLocaleString()}</p>
          )}
          <ChangeChip pct={card.change_pct} />
        </div>
      </div>

      <div className="flex gap-3 text-[11px] text-gray-400 dark:text-zinc-500">
        {card.pe_ratio && <span>P/E <span className="text-gray-600 dark:text-zinc-300 font-mono">{card.pe_ratio}</span></span>}
        {card.market_cap && <span>MCap <span className="text-gray-600 dark:text-zinc-300 font-mono">${card.market_cap}B</span></span>}
      </div>

      <div className="flex gap-2 mt-auto">
        {added ? (
          <Link
            href={`/stocks/${card.ticker}`}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs bg-accent/10 text-accent rounded-xl font-medium transition-colors hover:bg-accent/20"
          >
            View thesis <ChevronRight className="w-3 h-3" />
          </Link>
        ) : (
          <button
            onClick={handleAdd}
            disabled={adding}
            className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-xl font-medium transition-colors"
          >
            {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            Add to portfolio
          </button>
        )}
        {!added && (
          <button
            onClick={handleWatch}
            disabled={watching || watched}
            title={watched ? "In watchlist" : "Add to watchlist"}
            className={`px-2.5 py-1.5 rounded-xl border transition-colors ${
              watched
                ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-500"
                : "border-gray-200 dark:border-zinc-700 text-gray-400 hover:text-amber-500 hover:border-amber-300"
            }`}
          >
            {watching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Star className={`w-3.5 h-3.5 ${watched ? "fill-current" : ""}`} />}
          </button>
        )}
      </div>
    </div>
  );
}

export default function ScreenerPage() {
  const { activePortfolioId, bumpStocksVersion } = usePortfolio();
  const [cards, setCards] = useState<ScreenerCard[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const data = await getScreener(activePortfolioId);
      setCards(data);
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [activePortfolioId]);

  async function handleAdd(ticker: string) {
    await addStock(ticker, activePortfolioId);
    bumpStocksVersion();
  }

  async function handleWatchlist(ticker: string) {
    // Add to portfolio as watchlist item
    await addStock(ticker, activePortfolioId);
    // Toggle watchlist via API
    const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const token = typeof window !== "undefined" ? localStorage.getItem("thesisarc_token") : null;
    const pid = activePortfolioId ? `?portfolio_id=${activePortfolioId}` : "";
    await fetch(`${BASE_URL}/stocks/${ticker}/watchlist${pid}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token ?? ""}` },
    });
    bumpStocksVersion();
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">Screener</h1>
          <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">Discover stocks to research and add to your portfolio or watchlist</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 dark:border-zinc-700 rounded-xl text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
        </div>
      ) : cards.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-12">No stocks to show — you may already have all of them in your portfolio.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {cards.map((card) => (
            <CardItem key={card.ticker} card={card} onAdd={handleAdd} onWatchlist={handleWatchlist} />
          ))}
        </div>
      )}
    </div>
  );
}
