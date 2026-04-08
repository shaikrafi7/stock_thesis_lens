"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  getMorningBriefing, refreshMorningBriefing, getBriefingHistory,
  type MorningBriefingResponse, type BriefingItem,
} from "@/lib/api";
import { usePortfolio } from "@/app/context/PortfolioContext";
import { RefreshCw, Loader2, Newspaper, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp } from "lucide-react";

const IMPACT_STYLES: Record<string, { color: string; bg: string; Icon: typeof TrendingUp; label: string }> = {
  bullish: { color: "text-green-400", bg: "border-l-green-500/40", Icon: TrendingUp, label: "Bullish" },
  bearish: { color: "text-red-400", bg: "border-l-red-500/40", Icon: TrendingDown, label: "Bearish" },
  neutral: { color: "text-zinc-400", bg: "border-l-zinc-600/40", Icon: Minus, label: "Neutral" },
};

function BriefingCard({ briefing, defaultOpen = true }: { briefing: MorningBriefingResponse; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  const groupedItems = briefing.items.reduce<Record<string, BriefingItem[]>>((acc, item) => {
    if (!acc[item.ticker]) acc[item.ticker] = [];
    acc[item.ticker].push(item);
    return acc;
  }, {});

  return (
    <div className="bg-surface rounded-2xl overflow-hidden card-border">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-raised/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Newspaper className="w-4 h-4 text-accent shrink-0" />
          <div className="text-left">
            <p className="text-sm font-semibold text-white">
              {briefing.date ? new Date(briefing.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "Briefing"}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{briefing.summary}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <span className="text-[10px] text-zinc-600">{briefing.items.length} items</span>
          {open ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4">
          {/* Summary */}
          <p className="text-sm text-zinc-300 leading-relaxed border-l-2 border-accent/30 pl-3">
            {briefing.summary}
          </p>

          {/* Items grouped by ticker */}
          {Object.entries(groupedItems).map(([ticker, items]) => (
            <div key={ticker}>
              <Link
                href={`/stocks/${ticker}`}
                className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-zinc-300 hover:text-accent transition-colors mb-2"
              >
                {ticker}
              </Link>
              <div className="space-y-2">
                {items.map((item, i) => {
                  const style = IMPACT_STYLES[item.impact] ?? IMPACT_STYLES.neutral;
                  return (
                    <div key={i} className={`pl-3 border-l-2 ${style.bg}`}>
                      <div className="flex items-start gap-2">
                        <style.Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${style.color}`} />
                        <div className="min-w-0">
                          {item.source_url ? (
                            <a href={item.source_url} target="_blank" rel="noopener noreferrer"
                              className="text-sm text-zinc-200 hover:text-white transition-colors leading-snug">
                              {item.headline}
                            </a>
                          ) : (
                            <p className="text-sm text-zinc-200 leading-snug">{item.headline}</p>
                          )}
                          <span className={`text-[10px] font-medium ${style.color} mt-0.5 block`}>{style.label}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {briefing.items.length === 0 && (
            <p className="text-sm text-zinc-600 italic">No news items for this briefing.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function BriefingPage() {
  const { activePortfolioId } = usePortfolio();
  const [today, setToday] = useState<MorningBriefingResponse | null>(null);
  const [history, setHistory] = useState<MorningBriefingResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [current, hist] = await Promise.all([
        getMorningBriefing(activePortfolioId),
        getBriefingHistory(10, activePortfolioId),
      ]);
      setToday(current);
      // History excludes today (same date)
      const todayDate = current.date?.split("T")[0];
      setHistory(hist.filter((b) => b.date?.split("T")[0] !== todayDate));
    } catch {
      setToday(null);
    } finally {
      setLoading(false);
    }
  }, [activePortfolioId]);

  useEffect(() => { load(); }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const fresh = await refreshMorningBriefing(activePortfolioId);
      setToday(fresh);
    } catch { /* ignore */ }
    finally { setRefreshing(false); }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-white">Morning Briefing</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Daily AI-generated news digest for your portfolio</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/6 hover:bg-zinc-800 text-xs text-zinc-300 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Today */}
          {today ? (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold mb-2">Today</p>
              <BriefingCard briefing={today} defaultOpen />
            </div>
          ) : (
            <div className="text-center py-12 text-zinc-600 text-sm">
              No briefing yet for today.
              <button onClick={handleRefresh} className="ml-2 text-accent hover:underline">Generate now</button>
            </div>
          )}

          {/* History */}
          {history.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold mb-2 mt-6">Past Briefings</p>
              <div className="space-y-3">
                {history.map((b, i) => (
                  <BriefingCard key={i} briefing={b} defaultOpen={false} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
