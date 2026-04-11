"use client";

import { useEffect, useState } from "react";
import {
  getBriefingHistory,
  fetchStockNews,
  type BriefingItem,
  type NewsItem,
} from "@/lib/api";
import { BriefingCard } from "./MorningBriefing";
import { ExternalLink, Newspaper, ChevronUp, ChevronDown, Loader2, Plus } from "lucide-react";
import { useAssistant } from "@/app/context/AssistantContext";

interface DayGroup {
  label: string;
  items: BriefingItem[];
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("default", { weekday: "short", month: "short", day: "numeric" });
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return "yesterday";
  return `${diffDays}d ago`;
}

export default function StockNews({ ticker }: { ticker: string }) {
  const [groups, setGroups] = useState<DayGroup[]>([]);
  const [fallbackNews, setFallbackNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [useFallback, setUseFallback] = useState(false);
  const { firePrefillThesisPoint } = useAssistant();

  useEffect(() => {
    getBriefingHistory(7)
      .then((history) => {
        const dayGroups: DayGroup[] = [];
        for (const briefing of history) {
          const filtered = briefing.items.filter(
            (item) => item.ticker.toUpperCase() === ticker.toUpperCase()
          );
          if (filtered.length > 0 && briefing.date) {
            dayGroups.push({
              label: formatDateLabel(briefing.date),
              items: filtered,
            });
          }
        }
        if (dayGroups.length > 0) {
          setGroups(dayGroups);
        } else {
          // No briefing items for this ticker — fall back to plain news
          setUseFallback(true);
          return fetchStockNews(ticker).then(setFallbackNews);
        }
      })
      .catch(() => {
        setUseFallback(true);
        fetchStockNews(ticker).then(setFallbackNews).catch(() => setFallbackNews([]));
      })
      .finally(() => setLoading(false));
  }, [ticker]);

  const hasContent = useFallback ? fallbackNews.length > 0 : groups.length > 0;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden card-hover">
      <div
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-gray-400 dark:text-zinc-500" />
          <span className="text-xs font-semibold tracking-wider text-gray-500 dark:text-zinc-400 uppercase">
            News & Impact
          </span>
        </div>
        {collapsed ? (
          <ChevronDown className="w-4 h-4 text-gray-400 dark:text-zinc-500" />
        ) : (
          <ChevronUp className="w-4 h-4 text-gray-400 dark:text-zinc-500" />
        )}
      </div>

      {!collapsed && (
        <div className="px-4 pb-3">
          {loading ? (
            <div className="flex items-center justify-center py-4 text-gray-400 dark:text-zinc-500">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : !hasContent ? (
            <p className="text-xs text-gray-400 dark:text-zinc-500 py-2">No recent news found</p>
          ) : useFallback ? (
            /* Plain news fallback */
            <div className="space-y-1">
              {fallbackNews.map((item, i) => (
                <div key={i} className="flex items-start gap-2 group py-1.5 border-b border-gray-100 dark:border-zinc-800/50 last:border-0">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2 flex-1 min-w-0"
                  >
                    <span className="text-xs text-gray-600 dark:text-zinc-300 leading-relaxed group-hover:text-gray-900 dark:group-hover:text-white transition-colors flex-1">
                      {item.title}
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0 mt-0.5">
                      {item.published_utc && (
                        <span className="text-[10px] text-gray-400 dark:text-zinc-600">{timeAgo(item.published_utc)}</span>
                      )}
                      <ExternalLink className="w-3 h-3 text-gray-400 dark:text-zinc-600 group-hover:text-gray-600 dark:group-hover:text-zinc-400 transition-colors" />
                    </span>
                  </a>
                  <button
                    onClick={() => firePrefillThesisPoint(item.title)}
                    title="Add as thesis point"
                    className="shrink-0 p-0.5 text-gray-300 dark:text-zinc-700 hover:text-accent transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            /* Briefing cards grouped by date */
            <div className="space-y-3">
              {groups.map((group) => (
                <div key={group.label}>
                  <p className="text-gray-400 dark:text-zinc-500 text-[10px] uppercase tracking-widest mb-1.5">
                    {group.label}
                  </p>
                  <div className="flex flex-col gap-2">
                    {group.items.map((item, i) => (
                      <div key={i} className="group relative">
                        <BriefingCard item={item} />
                        <button
                          onClick={() => firePrefillThesisPoint(item.headline)}
                          title="Add as thesis point"
                          className="absolute top-2 right-2 p-0.5 text-gray-300 dark:text-zinc-700 hover:text-accent transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
