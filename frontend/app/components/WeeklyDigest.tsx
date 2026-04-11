"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getWeeklyDigest, type WeeklyDigest } from "@/lib/api";
import { TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, BarChart2 } from "lucide-react";

const TREND_ICON = {
  up: { Icon: TrendingUp, color: "text-green-500" },
  down: { Icon: TrendingDown, color: "text-red-400" },
  flat: { Icon: Minus, color: "text-zinc-400" },
  new: { Icon: BarChart2, color: "text-teal-400" },
};

function scoreColor(s: number) {
  return s >= 75 ? "text-green-600 dark:text-green-400" : s >= 50 ? "text-amber-500" : "text-red-500";
}

export default function WeeklyDigestCard({ portfolioId }: { portfolioId: number | null | undefined }) {
  const [digest, setDigest] = useState<WeeklyDigest | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    getWeeklyDigest(portfolioId).then(setDigest).catch(() => {});
  }, [portfolioId]);

  if (!digest || digest.stocks.length === 0) return null;

  const evaluated = digest.stocks.filter((s) => s.current_score !== null);
  const movers = [...evaluated]
    .filter((s) => s.previous_score !== null)
    .sort((a, b) => Math.abs((b.current_score! - b.previous_score!)) - Math.abs((a.current_score! - a.previous_score!)))
    .slice(0, 3);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-gray-400 dark:text-zinc-500" />
          <span className="text-xs font-semibold tracking-wider text-gray-500 dark:text-zinc-400 uppercase">Portfolio Digest</span>
          {digest.portfolio_avg !== null && (
            <span className={`text-xs font-mono font-bold ml-1 ${scoreColor(digest.portfolio_avg)}`}>
              {Math.round(digest.portfolio_avg)}/100 avg
            </span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400 dark:text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-gray-400 dark:text-zinc-500" />}
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3">
          {/* All stocks */}
          <div className="flex flex-col gap-1">
            {digest.stocks.map((s) => {
              const t = TREND_ICON[s.trend as keyof typeof TREND_ICON] ?? TREND_ICON.flat;
              const delta = s.current_score !== null && s.previous_score !== null
                ? s.current_score - s.previous_score : null;
              return (
                <Link key={s.ticker} href={`/stocks/${s.ticker}`}
                  className="flex items-center gap-3 py-1.5 border-b border-gray-50 dark:border-zinc-800/50 last:border-0 hover:bg-gray-50 dark:hover:bg-zinc-800/30 rounded transition-colors px-1">
                  {s.logo_url && <img src={s.logo_url} alt={s.ticker} className="w-5 h-5 rounded object-contain" />}
                  <span className="font-mono text-xs font-bold text-gray-900 dark:text-white w-14 shrink-0">{s.ticker}</span>
                  {s.current_score !== null ? (
                    <>
                      <span className={`text-xs font-mono font-bold ${scoreColor(s.current_score)}`}>{Math.round(s.current_score)}</span>
                      <t.Icon className={`w-3 h-3 ${t.color} shrink-0`} />
                      {delta !== null && (
                        <span className={`text-[10px] font-mono ${delta > 0 ? "text-green-500" : delta < 0 ? "text-red-400" : "text-zinc-400"}`}>
                          {delta > 0 ? "+" : ""}{delta.toFixed(0)}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-gray-400 dark:text-zinc-500">No eval</span>
                  )}
                </Link>
              );
            })}
          </div>

          {movers.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-1.5">Biggest Movers</p>
              <div className="flex flex-wrap gap-2">
                {movers.map((s) => {
                  const delta = s.current_score! - s.previous_score!;
                  return (
                    <Link key={s.ticker} href={`/stocks/${s.ticker}`}
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-mono font-bold border ${
                        delta > 0
                          ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300"
                          : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-600 dark:text-red-300"
                      }`}>
                      {s.ticker}
                      <span className="font-normal">{delta > 0 ? "+" : ""}{delta.toFixed(0)}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
