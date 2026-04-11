"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  getMorningBriefing,
  refreshMorningBriefing,
  getBriefingHistory,
  addManualThesis,
  type MorningBriefingResponse,
  type BriefingItem,
} from "@/lib/api";
import { ChevronUp, ChevronDown, Plus, Check, Loader2, Newspaper, RefreshCw, ExternalLink, Globe } from "lucide-react";

export const IMPACT_STYLES: Record<string, { badge: string; dot: string }> = {
  bullish: { badge: "bg-green-50 dark:bg-green-950/60 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400", dot: "bg-green-500" },
  bearish: { badge: "bg-red-50 dark:bg-red-950/60 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400", dot: "bg-red-500" },
  neutral: { badge: "bg-gray-50 dark:bg-zinc-800/60 border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-zinc-400", dot: "bg-gray-400 dark:bg-zinc-500" },
};

const CATEGORY_LABELS: Record<string, string> = {
  competitive_moat: "Moat",
  growth_trajectory: "Growth",
  valuation: "Valuation",
  financial_health: "Financials",
  ownership_conviction: "Conviction",
  risks: "Risk",
};

export function BriefingCard({ item }: { item: BriefingItem }) {
  const [added, setAdded] = useState(false);
  const [adding, setAdding] = useState(false);

  const styles = IMPACT_STYLES[item.impact] ?? IMPACT_STYLES.neutral;

  async function handleAdd() {
    if (!item.suggestion || adding || added) return;
    setAdding(true);
    try {
      await addManualThesis(item.ticker, item.suggestion.category, item.suggestion.statement);
      setAdded(true);
    } catch {
      // silent — user can retry
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className={`border rounded-xl p-3 ${styles.badge}`}>
      <div className="flex items-start gap-2">
        <span className={`shrink-0 w-1.5 h-1.5 rounded-full mt-1.5 ${styles.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            {item.ticker === "MACRO" ? (
              <span className="flex items-center gap-1 text-xs font-mono font-bold text-zinc-400">
                <Globe className="w-3 h-3" />Macro
              </span>
            ) : (
              <Link
                href={`/stocks/${item.ticker}`}
                onClick={(e) => e.stopPropagation()}
                className="text-xs font-mono font-bold text-gray-700 dark:text-zinc-300 hover:text-accent transition-colors"
              >
                {item.ticker}
              </Link>
            )}
            <span className="text-[10px] uppercase tracking-wide opacity-70">{item.impact}</span>
            {item.suggestion?.category && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">
                {CATEGORY_LABELS[item.suggestion.category] ?? item.suggestion.category}
              </span>
            )}
          </div>
          <p className="text-gray-600 dark:text-zinc-300 text-xs leading-relaxed">
            {item.headline}
            {item.source_url && (
              <a
                href={item.source_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center ml-1.5 text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors"
                title="Open source article"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </p>
          {item.related_thesis && (
            <div className="mt-1.5 flex items-start gap-1">
              <span className={`shrink-0 text-[9px] uppercase tracking-wider font-semibold mt-0.5 ${item.impact === "bearish" ? "text-red-500" : item.impact === "bullish" ? "text-green-600 dark:text-green-400" : "text-gray-400"}`}>
                {item.impact === "bearish" ? "Challenges" : item.impact === "bullish" ? "Supports" : "Related to"}:
              </span>
              <span className="text-[11px] text-gray-500 dark:text-zinc-400 italic leading-snug">&ldquo;{item.related_thesis}&rdquo;</span>
            </div>
          )}
          {item.suggestion && (
            <div className="mt-2 pt-2 border-t border-current opacity-60">
              <p className="text-[11px] italic leading-snug mb-1.5">
                &ldquo;{item.suggestion.statement}&rdquo;
              </p>
              <button
                onClick={handleAdd}
                disabled={adding || added}
                className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-accent hover:bg-accent-hover disabled:opacity-50 text-white font-semibold transition-colors"
              >
                {added ? <Check className="w-3 h-3" /> : adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                {added ? "Added" : adding ? "Adding\u2026" : `Add to ${item.ticker}`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BriefingSection({ data, dateLabel, collapsible = false }: { data: MorningBriefingResponse; dateLabel: string; collapsible?: boolean }) {
  const [open, setOpen] = useState(!collapsible);
  const itemCount = data.items.length;

  if (collapsible) {
    return (
      <div className="border-t border-gray-100 dark:border-zinc-800">
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
        >
          <span className="text-xs font-medium text-gray-500 dark:text-zinc-400">{dateLabel}</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400 dark:text-zinc-600">{itemCount} item{itemCount !== 1 ? "s" : ""}</span>
            {open ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 dark:text-zinc-600" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400 dark:text-zinc-600" />}
          </div>
        </button>
        {open && (
          <div className="px-4 pb-3">
            {data.summary && (
              <p className="text-gray-500 dark:text-zinc-400 text-xs leading-relaxed mb-3 border-l-2 border-accent/30 pl-3">
                {data.summary}
              </p>
            )}
            {itemCount > 0 && (
              <div className="flex flex-col gap-2">
                {data.items.map((item, i) => <BriefingCard key={i} item={item} />)}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      <p className="text-gray-400 dark:text-zinc-500 text-[10px] uppercase tracking-widest mb-2">{dateLabel}</p>
      {data.summary && (
        <p className="text-gray-500 dark:text-zinc-400 text-sm leading-relaxed mb-4 border-l-2 border-accent/30 pl-3">
          {data.summary}
        </p>
      )}
      {data.items.length > 0 && (
        <div className="flex flex-col gap-2">
          {data.items.map((item, i) => (
            <BriefingCard key={i} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function MorningBriefing({ portfolioId }: { portfolioId?: number | null } = {}) {
  const [data, setData] = useState<MorningBriefingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(true);
  const [history, setHistory] = useState<MorningBriefingResponse[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const fresh = await refreshMorningBriefing(portfolioId);
      setData(fresh);
      // Reset history so it re-fetches if opened
      setHistory(null);
      setHistoryOpen(false);
    } catch {
      // silent
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    getMorningBriefing(portfolioId, controller.signal)
      .then(async (result) => {
        const isEmpty = !result || (!result.summary && result.items.length === 0);
        const isStale = result?.date
          ? Date.now() - new Date(result.date).getTime() > 24 * 60 * 60 * 1000
          : true;

        if (isEmpty || isStale) {
          try {
            const fresh = await refreshMorningBriefing(portfolioId);
            setData(fresh);
          } catch {
            setData(result);
          }
        } else {
          setData(result);
        }
      })
      .catch(() => {/* silent */})
      .finally(() => { clearTimeout(timeout); setLoading(false); });

    return () => { clearTimeout(timeout); controller.abort(); };
  }, [portfolioId]);

  function handleToggleHistory() {
    if (!historyOpen && !history) {
      setHistoryLoading(true);
      getBriefingHistory(7, portfolioId)
        .then((h) => {
          // Filter out today's briefing (already shown above)
          const past = h.filter((b) => b.date !== data?.date);
          setHistory(past);
        })
        .catch(() => setHistory([]))
        .finally(() => setHistoryLoading(false));
    }
    setHistoryOpen((o) => !o);
  }

  if (loading) {
    return (
      <div className="animate-pulse border border-gray-200 dark:border-zinc-800 rounded-2xl p-4 mb-8">
        <div className="h-3 bg-gray-100 dark:bg-zinc-800 rounded w-32 mb-3" />
        <div className="h-4 bg-gray-100 dark:bg-zinc-800 rounded w-2/3 mb-2" />
        <div className="h-4 bg-gray-100 dark:bg-zinc-800 rounded w-1/2" />
      </div>
    );
  }

  if (!data || (!data.summary && data.items.length === 0)) {
    return (
      <div className="border border-gray-200 dark:border-zinc-800 rounded-2xl mb-4 overflow-hidden bg-white dark:bg-zinc-900">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-gray-400 dark:text-zinc-500" />
            <span className="text-xs uppercase tracking-widest text-gray-500 dark:text-zinc-500 font-semibold">Today&apos;s Briefing</span>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-50 transition-colors"
            title="Generate briefing"
          >
            {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </button>
        </div>
        <p className="px-4 pb-3 text-xs text-gray-400 dark:text-zinc-500">No briefing yet for today.</p>
      </div>
    );
  }

  const today = new Date().toLocaleDateString("default", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="border border-gray-200 dark:border-zinc-800 rounded-2xl mb-4 overflow-hidden bg-white dark:bg-zinc-900 card-hover">
      <div
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer select-none"
      >
        <div className="flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-gray-400 dark:text-zinc-500" />
          <span className="text-xs uppercase tracking-widest text-gray-500 dark:text-zinc-500 font-semibold">Today&apos;s Briefing</span>
          <span className="text-gray-400 dark:text-zinc-600 text-xs">{today}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); handleRefresh(); }}
            disabled={refreshing}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors disabled:opacity-50"
            title="Refresh briefing with latest news"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          {open ? <ChevronUp className="w-4 h-4 text-gray-400 dark:text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-gray-400 dark:text-zinc-500" />}
        </div>
      </div>

      {open && (
        <>
          <BriefingSection data={data} dateLabel="Today" />

          {/* Past briefings toggle */}
          <div className="border-t border-gray-100 dark:border-zinc-800">
            <button
              onClick={handleToggleHistory}
              className="w-full flex items-center justify-between px-4 py-2 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
            >
              <span className="text-[11px] text-gray-400 dark:text-zinc-500">
                {historyOpen ? "Hide past briefings" : "Show past briefings"}
              </span>
              {historyOpen ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 dark:text-zinc-600" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400 dark:text-zinc-600" />}
            </button>

            {historyOpen && (
              <div className="border-t border-gray-100 dark:border-zinc-800">
                {historyLoading && (
                  <div className="px-4 py-4">
                    <div className="animate-pulse h-3 bg-gray-100 dark:bg-zinc-800 rounded w-48" />
                  </div>
                )}
                {history && history.length === 0 && (
                  <p className="text-gray-400 dark:text-zinc-600 text-xs px-4 py-3">No past briefings yet.</p>
                )}
                {history && history.length > 0 && (
                  <div className="flex flex-col">
                    {history.map((b, i) => {
                      const label = b.date
                        ? new Date(b.date + "T00:00:00").toLocaleDateString("default", {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })
                        : `Past ${i + 1}`;
                      return <BriefingSection key={b.date ?? i} data={b} dateLabel={label} collapsible />;
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
