"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { CalendarClock, ChevronDown, ChevronUp } from "lucide-react";
import { getPortfolioCalendar, type CalendarEvent } from "@/lib/api";
import { usePortfolio } from "@/app/context/PortfolioContext";

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr);
  d.setHours(12, 0, 0, 0);
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function EarningsCalendar() {
  const { activePortfolioId } = usePortfolio();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setLoading(true);
    getPortfolioCalendar(activePortfolioId)
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [activePortfolioId]);

  if (!loading && events.length === 0) return null;

  return (
    <div className="border border-gray-100 dark:border-zinc-800 rounded-2xl overflow-hidden">
      <button
        onClick={() => setCollapsed((p) => !p)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700 dark:text-zinc-200 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-accent" />
          Upcoming Events
          {!collapsed && events.length > 0 && (
            <span className="text-[10px] font-normal text-gray-400 dark:text-zinc-500">next 60 days</span>
          )}
        </span>
        {collapsed ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
      </button>

      {!collapsed && (
        <div className="divide-y divide-gray-50 dark:divide-zinc-800/50">
          {loading ? (
            <div className="px-4 py-3 text-xs text-gray-400 dark:text-zinc-500">Loading…</div>
          ) : events.map((ev) => {
            const days = daysUntil(ev.date);
            const isEarnings = ev.event_type === "earnings";
            const urgency = days <= 7;
            return (
              <div key={`${ev.ticker}-${ev.event_type}-${ev.date}`} className="flex items-center gap-3 px-4 py-2.5">
                <span className={`shrink-0 text-[9px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded ${
                  isEarnings
                    ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400"
                    : "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400"
                }`}>
                  {isEarnings ? "Earnings" : "Ex-Div"}
                </span>
                <Link
                  href={`/stocks/${ev.ticker}`}
                  className="text-xs font-mono font-bold text-gray-700 dark:text-zinc-300 hover:text-accent transition-colors"
                >
                  {ev.ticker}
                </Link>
                <span className="text-xs text-gray-400 dark:text-zinc-500 truncate flex-1">{ev.name}</span>
                <span className={`text-xs font-medium shrink-0 ${urgency ? "text-amber-600 dark:text-amber-400" : "text-gray-500 dark:text-zinc-400"}`}>
                  {formatDate(ev.date)}
                  <span className="ml-1 text-[10px] font-normal text-gray-400 dark:text-zinc-500">
                    ({days === 0 ? "today" : `${days}d`})
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
