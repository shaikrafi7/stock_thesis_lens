"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getScreener, addStock, dismissScreenerStock, clearDismissedScreener, type ScreenerCard } from "@/lib/api";
import { usePortfolio } from "@/app/context/PortfolioContext";
import {
  Loader2, RefreshCw, Plus, Star, TrendingUp, TrendingDown, Minus,
  ChevronRight, ThumbsUp, ThumbsDown, LayoutGrid, CreditCard, RotateCcw,
} from "lucide-react";

const RATING_LABEL: Record<string, string> = {
  strong_buy: "Strong Buy",
  strongbuy: "Strong Buy",
  buy: "Buy",
  hold: "Hold",
  underperform: "Underperform",
  sell: "Sell",
};

const RATING_COLOR: Record<string, string> = {
  strong_buy: "text-emerald-600 dark:text-emerald-400",
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

// ── Grid card ────────────────────────────────────────────────────────────────

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

      {card.rationale && (
        <p className="text-[10px] text-gray-400 dark:text-zinc-500 italic leading-snug">Recommended: {card.rationale}</p>
      )}

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

// ── Swipe card ───────────────────────────────────────────────────────────────

function SwipeCard({ card, onLike, onSkip, remaining }: {
  card: ScreenerCard;
  onLike: () => void;
  onSkip: () => void;
  remaining: number;
}) {
  return (
    <div className="flex flex-col items-center gap-6">
      {/* Progress */}
      <p className="text-xs text-gray-400 dark:text-zinc-500">{remaining} left to review</p>

      {/* Card */}
      <div className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl p-6 shadow-lg">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href={`/stocks/${card.ticker}`} className="font-mono font-bold text-lg text-accent hover:underline">
                {card.ticker}
              </Link>
              {card.analyst_rating && (
                <span className={`text-xs font-semibold ${RATING_COLOR[card.analyst_rating] ?? "text-gray-400"}`}>
                  {RATING_LABEL[card.analyst_rating] ?? card.analyst_rating}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600 dark:text-zinc-400">{card.name}</p>
            {card.sector && <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">{card.sector}</p>}
          </div>
          <div className="text-right shrink-0 ml-4">
            {card.price !== null && (
              <p className="text-base font-mono font-bold text-gray-800 dark:text-zinc-200">${card.price.toLocaleString()}</p>
            )}
            <ChangeChip pct={card.change_pct} />
          </div>
        </div>

        {/* Metrics */}
        <div className="flex gap-4 text-sm text-gray-500 dark:text-zinc-500 border-t border-gray-100 dark:border-zinc-800 pt-4">
          {card.pe_ratio && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-600">P/E</p>
              <p className="font-mono font-semibold text-gray-700 dark:text-zinc-300">{card.pe_ratio}</p>
            </div>
          )}
          {card.market_cap && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-600">Market Cap</p>
              <p className="font-mono font-semibold text-gray-700 dark:text-zinc-300">${card.market_cap}B</p>
            </div>
          )}
        </div>
        {card.rationale && (
          <p className="text-xs text-gray-400 dark:text-zinc-500 italic mt-3">Recommended: {card.rationale}</p>
        )}
      </div>

      {/* Buttons */}
      <div className="flex gap-6">
        <button
          onClick={onSkip}
          className="w-16 h-16 rounded-full border-2 border-red-200 dark:border-red-900 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-400 flex items-center justify-center transition-colors"
          title="Skip — not interested"
        >
          <ThumbsDown className="w-6 h-6" />
        </button>
        <button
          onClick={onLike}
          className="w-16 h-16 rounded-full border-2 border-emerald-200 dark:border-emerald-900 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:border-emerald-400 flex items-center justify-center transition-colors"
          title="Add to watchlist"
        >
          <ThumbsUp className="w-6 h-6" />
        </button>
      </div>

      <p className="text-[11px] text-gray-400 dark:text-zinc-600">
        <ThumbsUp className="w-3 h-3 inline mr-1" />Watchlist &nbsp;·&nbsp;
        <ThumbsDown className="w-3 h-3 inline mr-1" />Skip
      </p>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ScreenerPage() {
  const { activePortfolioId, bumpStocksVersion } = usePortfolio();
  const [cards, setCards] = useState<ScreenerCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);
  const [swipeMode, setSwipeMode] = useState(false);
  const [swipeIndex, setSwipeIndex] = useState(0);
  const [swipeDone, setSwipeDone] = useState(false);
  const [shadowPortfolio, setShadowPortfolio] = useState<Array<{ ticker: string; name: string; price: number; likedAt: string }>>([]);
  const [shadowOpen, setShadowOpen] = useState(false);

  async function load() {
    setLoading(true);
    setSwipeIndex(0);
    setSwipeDone(false);
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

  useEffect(() => {
    try {
      const stored = localStorage.getItem("screener_shadow_portfolio");
      if (stored) setShadowPortfolio(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  function saveShadow(entry: { ticker: string; name: string; price: number; likedAt: string }) {
    setShadowPortfolio((prev) => {
      const updated = [entry, ...prev.filter((e) => e.ticker !== entry.ticker)];
      localStorage.setItem("screener_shadow_portfolio", JSON.stringify(updated));
      return updated;
    });
  }

  async function handleAdd(ticker: string) {
    await addStock(ticker, activePortfolioId);
    bumpStocksVersion();
  }

  async function handleWatchlist(ticker: string) {
    await addStock(ticker, activePortfolioId);
    const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const token = typeof window !== "undefined" ? localStorage.getItem("thesisarc_token") : null;
    const pid = activePortfolioId ? `?portfolio_id=${activePortfolioId}` : "";
    await fetch(`${BASE_URL}/stocks/${ticker}/watchlist${pid}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token ?? ""}` },
    });
    bumpStocksVersion();
  }

  // Swipe handlers
  const swipeCards = cards.filter((c) => !c.in_portfolio && !c.in_watchlist);

  async function handleSwipeLike() {
    const card = swipeCards[swipeIndex];
    if (!card) return;
    await handleWatchlist(card.ticker);
    if (card.price != null) {
      saveShadow({ ticker: card.ticker, name: card.name, price: card.price, likedAt: new Date().toISOString() });
    }
    advance();
  }

  async function handleSwipeSkip() {
    const card = swipeCards[swipeIndex];
    if (!card) return;
    await dismissScreenerStock(card.ticker).catch(() => {});
    advance();
  }

  function advance() {
    const next = swipeIndex + 1;
    if (next >= swipeCards.length) {
      setSwipeDone(true);
    } else {
      setSwipeIndex(next);
    }
  }

  async function handleResetDismissed() {
    await clearDismissedScreener().catch(() => {});
    load();
  }

  const sectors = Array.from(new Set(cards.map((c) => c.sector).filter(Boolean) as string[])).sort();
  const filtered = sectorFilter ? cards.filter((c) => c.sector === sectorFilter) : cards;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">Screener</h1>
          <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">Discover stocks to research and add to your portfolio or watchlist</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <button
            onClick={() => setSwipeMode((s) => !s)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-xl transition-colors ${
              swipeMode
                ? "bg-accent text-white border-accent"
                : "border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800"
            }`}
            title={swipeMode ? "Switch to grid view" : "Switch to swipe view"}
          >
            {swipeMode ? <LayoutGrid className="w-3.5 h-3.5" /> : <CreditCard className="w-3.5 h-3.5" />}
            {swipeMode ? "Grid" : "Swipe"}
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 dark:border-zinc-700 rounded-xl text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Shadow portfolio panel */}
      {shadowPortfolio.length > 0 && (
        <div className="mb-4 border border-gray-200 dark:border-zinc-800 rounded-xl overflow-hidden">
          <button
            onClick={() => setShadowOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-zinc-900 text-xs text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <span className="font-medium text-gray-700 dark:text-zinc-300">Swipe Tracker — {shadowPortfolio.length} liked</span>
            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${shadowOpen ? "rotate-90" : ""}`} />
          </button>
          {shadowOpen && (
            <div className="divide-y divide-gray-100 dark:divide-zinc-800">
              {shadowPortfolio.map((entry) => {
                const current = cards.find((c) => c.ticker === entry.ticker)?.price ?? null;
                const pctChange = current != null && entry.price > 0
                  ? ((current - entry.price) / entry.price) * 100
                  : null;
                return (
                  <div key={entry.ticker} className="flex items-center gap-3 px-4 py-2 text-xs">
                    <span className="font-mono font-semibold w-12 text-gray-800 dark:text-zinc-200">{entry.ticker}</span>
                    <span className="text-gray-400 dark:text-zinc-500 flex-1">{entry.name}</span>
                    <span className="text-gray-400 dark:text-zinc-500">liked at ${entry.price.toFixed(2)}</span>
                    {current != null && (
                      <span className="text-gray-600 dark:text-zinc-400">now ${current.toFixed(2)}</span>
                    )}
                    {pctChange != null && (
                      <span className={`font-mono font-bold ${pctChange >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                        {pctChange >= 0 ? "+" : ""}{pctChange.toFixed(1)}%
                      </span>
                    )}
                    <span className="text-gray-300 dark:text-zinc-600">{new Date(entry.likedAt).toLocaleDateString()}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
        </div>
      ) : swipeMode ? (
        /* ── Swipe mode ── */
        swipeDone || swipeCards.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-4 text-center">
            <p className="text-gray-400 dark:text-zinc-500 text-sm">
              {swipeCards.length === 0 ? "All stocks already in your portfolio or watchlist." : "You've reviewed all available stocks!"}
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleResetDismissed}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 dark:border-zinc-700 rounded-xl text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset dismissed
              </button>
              <button
                onClick={load}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent text-white rounded-xl hover:bg-accent-hover transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Load new batch
              </button>
            </div>
          </div>
        ) : (
          <SwipeCard
            card={swipeCards[swipeIndex]}
            onLike={handleSwipeLike}
            onSkip={handleSwipeSkip}
            remaining={swipeCards.length - swipeIndex}
          />
        )
      ) : (
        /* ── Grid mode ── */
        <>
          {sectors.length > 1 && (
            <div className="flex gap-1.5 flex-wrap mb-4">
              <button
                onClick={() => setSectorFilter(null)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${!sectorFilter ? "bg-accent text-white" : "bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-700"}`}
              >
                All
              </button>
              {sectors.map((s) => (
                <button
                  key={s}
                  onClick={() => setSectorFilter(sectorFilter === s ? null : s)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${sectorFilter === s ? "bg-accent text-white" : "bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-700"}`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">No stocks to show.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map((card) => (
                <CardItem key={card.ticker} card={card} onAdd={handleAdd} onWatchlist={handleWatchlist} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
