"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getThesisOverview, type ThesisOverviewItem } from "@/lib/api";
import { Loader2, ThumbsUp, ThumbsDown, ChevronDown, ChevronUp } from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  competitive_moat: "Competitive Moat",
  growth_trajectory: "Growth Trajectory",
  valuation: "Valuation",
  financial_health: "Financial Health",
  ownership_conviction: "Ownership & Conviction",
  risks: "Risks & Bear Case",
};

const CATEGORY_ORDER = [
  "competitive_moat", "growth_trajectory", "valuation",
  "financial_health", "ownership_conviction", "risks",
];

function scoreColor(score: number | null) {
  if (score === null) return "text-gray-300 dark:text-zinc-600";
  if (score >= 75) return "text-emerald-500";
  if (score >= 50) return "text-amber-500";
  return "text-red-500";
}

export default function ThesisOverviewPanel({ portfolioId }: { portfolioId?: number | null }) {
  const [items, setItems] = useState<ThesisOverviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getThesisOverview(portfolioId)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [open, portfolioId]);

  // Group by category
  const grouped: Record<string, ThesisOverviewItem[]> = {};
  for (const item of items) {
    (grouped[item.category] ??= []).push(item);
  }

  return (
    <div className="border border-gray-100 dark:border-zinc-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        title="View all thesis points across your portfolio, grouped by category"
        className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
      >
        <span>Portfolio Thesis Overview</span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {open && (
        <div className="border-t border-gray-100 dark:border-zinc-800">
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin text-accent" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-zinc-500 p-4">No thesis points found.</p>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-zinc-800/60">
              {CATEGORY_ORDER.filter((cat) => grouped[cat]?.length).map((cat) => {
                const catItems = grouped[cat];
                const isExpanded = expandedCategory === cat;
                return (
                  <div key={cat}>
                    <button
                      onClick={() => setExpandedCategory(isExpanded ? null : cat)}
                      className="w-full flex items-center justify-between px-4 py-2 hover:bg-gray-50 dark:hover:bg-zinc-800/40 transition-colors"
                    >
                      <span className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-zinc-400 font-semibold">
                        {CATEGORY_LABELS[cat] ?? cat}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-400 dark:text-zinc-600">{catItems.length} points</span>
                        {isExpanded ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="pb-2">
                        {catItems.map((item) => (
                          <div key={item.thesis_id} className="flex items-start gap-3 px-4 py-2 hover:bg-gray-50 dark:hover:bg-zinc-800/30 transition-colors">
                            <Link
                              href={`/stocks/${item.ticker}`}
                              className={`shrink-0 text-xs font-mono font-semibold mt-0.5 ${scoreColor(item.score)} hover:underline`}
                              title={item.score !== null ? `Score: ${item.score.toFixed(0)}` : "Not evaluated"}
                            >
                              {item.ticker}
                            </Link>
                            <p className="flex-1 text-xs text-gray-600 dark:text-zinc-300 leading-snug">{item.statement}</p>
                            {item.conviction === "liked" && <ThumbsUp className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />}
                            {item.conviction === "disliked" && <ThumbsDown className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
