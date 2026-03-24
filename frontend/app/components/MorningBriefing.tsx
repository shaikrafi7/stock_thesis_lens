"use client";

import { useState, useEffect } from "react";
import {
  getMorningBriefing,
  addManualThesis,
  type MorningBriefingResponse,
  type BriefingItem,
} from "@/lib/api";

const IMPACT_STYLES: Record<string, { badge: string; dot: string }> = {
  bullish: { badge: "bg-green-950 border-green-800 text-green-400", dot: "bg-green-500" },
  bearish: { badge: "bg-red-950 border-red-800 text-red-400", dot: "bg-red-500" },
  neutral: { badge: "bg-zinc-800 border-zinc-700 text-zinc-400", dot: "bg-zinc-500" },
};

function BriefingCard({ item }: { item: BriefingItem }) {
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
    <div className={`border rounded-lg p-3 ${styles.badge}`}>
      <div className="flex items-start gap-2">
        <span className={`shrink-0 w-1.5 h-1.5 rounded-full mt-1.5 ${styles.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-mono font-bold text-zinc-300">{item.ticker}</span>
            <span className="text-[10px] uppercase tracking-wide opacity-70">{item.impact}</span>
          </div>
          <p className="text-zinc-300 text-xs leading-relaxed">{item.headline}</p>
          {item.suggestion && (
            <div className="mt-2 pt-2 border-t border-current opacity-60">
              <p className="text-[11px] italic leading-snug mb-1.5">
                &ldquo;{item.suggestion.statement}&rdquo;
              </p>
              <button
                onClick={handleAdd}
                disabled={adding || added}
                className="text-[10px] px-2 py-0.5 rounded bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white transition-colors"
              >
                {added ? "Added ✓" : adding ? "Adding…" : `Add to ${item.ticker}`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MorningBriefing() {
  const [data, setData] = useState<MorningBriefingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    getMorningBriefing()
      .then(setData)
      .catch(() => {/* silent — section just won't render */})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse border border-zinc-800 rounded-xl p-4 mb-8">
        <div className="h-3 bg-zinc-800 rounded w-32 mb-3" />
        <div className="h-4 bg-zinc-800 rounded w-2/3 mb-2" />
        <div className="h-4 bg-zinc-800 rounded w-1/2" />
      </div>
    );
  }

  if (!data || (!data.summary && data.items.length === 0)) return null;

  const today = new Date().toLocaleDateString("default", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="border border-zinc-800 rounded-xl mb-8 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900 hover:bg-zinc-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-widest text-zinc-500 font-semibold">Today&apos;s Briefing</span>
          <span className="text-zinc-600 text-xs">{today}</span>
        </div>
        <span className="text-zinc-500 text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-4 py-3 bg-zinc-950">
          {data.summary && (
            <p className="text-zinc-400 text-sm leading-relaxed mb-4 border-l-2 border-zinc-700 pl-3">
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
      )}
    </div>
  );
}
