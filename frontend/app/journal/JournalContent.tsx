"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen, CheckCircle2, MinusCircle, XCircle, AlertTriangle,
  Search, Loader2, Filter,
} from "lucide-react";
import { getAuditLog, type ClosedThesisEntry, type ThesisOutcome } from "@/lib/api";
import { usePortfolio } from "@/app/context/PortfolioContext";

const CATEGORY_LABELS: Record<string, string> = {
  competitive_moat: "Competitive Moat",
  growth_trajectory: "Growth Trajectory",
  valuation: "Valuation",
  financial_health: "Financial Health",
  ownership_conviction: "Ownership & Conviction",
  risks: "Risks & Bear Case",
};

const OUTCOME_META: Record<ThesisOutcome, {
  label: string;
  Icon: typeof CheckCircle2;
  tone: string;
  dot: string;
}> = {
  played_out: {
    label: "Played out",
    Icon: CheckCircle2,
    tone: "text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  partial: {
    label: "Partial",
    Icon: MinusCircle,
    tone: "text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  failed: {
    label: "Broke",
    Icon: XCircle,
    tone: "text-rose-700 dark:text-rose-400",
    dot: "bg-rose-500",
  },
  invalidated: {
    label: "Invalidated",
    Icon: AlertTriangle,
    tone: "text-sky-700 dark:text-sky-400",
    dot: "bg-sky-500",
  },
};

const FILTER_TABS: Array<{ value: ThesisOutcome | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "played_out", label: "Played out" },
  { value: "partial", label: "Partial" },
  { value: "failed", label: "Broke" },
  { value: "invalidated", label: "Invalidated" },
];

export default function JournalContent({ showHeader = true }: { showHeader?: boolean }) {
  const { activePortfolioId } = usePortfolio();
  const [entries, setEntries] = useState<ClosedThesisEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [outcomeFilter, setOutcomeFilter] = useState<ThesisOutcome | "all">("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAuditLog({
        outcome: outcomeFilter === "all" ? undefined : outcomeFilter,
        q: debouncedSearch || undefined,
        portfolioId: activePortfolioId ?? undefined,
        limit: 200,
      });
      setEntries(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load journal");
    } finally {
      setLoading(false);
    }
  }, [outcomeFilter, debouncedSearch, activePortfolioId]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<ThesisOutcome | "all", number> = {
      all: entries.length,
      played_out: 0,
      partial: 0,
      failed: 0,
      invalidated: 0,
    };
    for (const e of entries) {
      if (e.outcome && e.outcome in c) c[e.outcome] += 1;
    }
    return c;
  }, [entries]);

  const stats = useMemo(() => {
    if (entries.length === 0) return null;
    const total = entries.length;
    const durations = entries
      .map((e) => e.duration_days)
      .filter((d): d is number => typeof d === "number" && d >= 0);
    const avgDuration =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null;
    return { total, avgDuration };
  }, [entries]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {showHeader && (
        <header className="mb-6">
          <div className="flex items-center gap-2.5 mb-1.5">
            <BookOpen className="w-5 h-5 text-indigo-500" />
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Decision Journal</h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-zinc-400 max-w-2xl">
            Every thesis you&apos;ve closed, with its outcome and what you learned. The point isn&apos;t to be right —
            it&apos;s to get better at knowing <em>when you&apos;re wrong</em>.
          </p>
        </header>
      )}

      {stats && stats.total >= 3 && outcomeFilter === "all" && !debouncedSearch && (
        <div className="mb-5 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <div className="flex items-baseline justify-between mb-2.5">
            <div className="text-[11px] uppercase tracking-widest text-gray-500 dark:text-zinc-400 font-semibold">
              Outcome Distribution
            </div>
            <div className="text-[11px] text-gray-400 dark:text-zinc-500">
              {stats.total} closed{stats.avgDuration != null ? ` · avg ${stats.avgDuration}d held` : ""}
            </div>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden bg-gray-100 dark:bg-zinc-800">
            {(["played_out", "partial", "failed", "invalidated"] as const).map((o) => {
              const n = counts[o];
              if (n === 0) return null;
              const pct = (n / stats.total) * 100;
              return (
                <div
                  key={o}
                  className={OUTCOME_META[o].dot}
                  style={{ width: `${pct}%` }}
                  title={`${OUTCOME_META[o].label}: ${n} (${pct.toFixed(0)}%)`}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5">
            {(["played_out", "partial", "failed", "invalidated"] as const).map((o) => {
              const n = counts[o];
              if (n === 0) return null;
              const pct = ((n / stats.total) * 100).toFixed(0);
              return (
                <div key={o} className="flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-zinc-400">
                  <span className={`w-1.5 h-1.5 rounded-full ${OUTCOME_META[o].dot}`} />
                  <span>
                    {OUTCOME_META[o].label} <span className="text-gray-400 dark:text-zinc-500">{pct}%</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1 flex-wrap">
          {FILTER_TABS.map((t) => {
            const active = outcomeFilter === t.value;
            const count = counts[t.value];
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setOutcomeFilter(t.value)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full transition-colors ${
                  active
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-700"
                }`}
              >
                {t.label}
                <span
                  className={`inline-flex items-center justify-center min-w-[1.25rem] h-4 px-1 text-[10px] font-semibold rounded-full ${
                    active ? "bg-indigo-700 text-white" : "bg-white dark:bg-zinc-900 text-gray-500 dark:text-zinc-400"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-zinc-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search lessons, tickers, statements…"
            className="pl-8 pr-3 py-1.5 text-xs rounded-full border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-white w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 text-sm text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-900 rounded-lg p-3">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <EmptyState hasFilters={outcomeFilter !== "all" || debouncedSearch.length > 0} />
      ) : (
        <ol className="space-y-3">
          {entries.map((entry) => {
            const meta = entry.outcome ? OUTCOME_META[entry.outcome] : null;
            const Icon = meta?.Icon ?? MinusCircle;
            const closedWhen = entry.closed_at ? new Date(entry.closed_at) : null;
            return (
              <li
                key={entry.thesis_id}
                className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4 flex flex-col sm:flex-row gap-4"
              >
                <div className="sm:w-44 shrink-0">
                  <Link
                    href={`/stocks/${entry.ticker}`}
                    className="inline-flex items-baseline gap-1.5 text-base font-semibold text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  >
                    {entry.ticker}
                  </Link>
                  {entry.stock_name && (
                    <div className="text-[11px] text-gray-500 dark:text-zinc-500 truncate">
                      {entry.stock_name}
                    </div>
                  )}
                  <div className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-zinc-600 mt-1.5 font-medium">
                    {CATEGORY_LABELS[entry.category] || entry.category}
                  </div>
                  {closedWhen && (
                    <div className="text-[11px] text-gray-500 dark:text-zinc-500 mt-2">
                      closed {closedWhen.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      {entry.duration_days != null && (
                        <span className="text-gray-400 dark:text-zinc-600"> · {entry.duration_days}d held</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-800 dark:text-zinc-200 leading-snug mb-2">
                    &ldquo;{entry.statement}&rdquo;
                  </div>

                  {meta && (
                    <div className={`inline-flex items-center gap-1.5 text-xs font-medium mb-2 ${meta.tone}`}>
                      <Icon className="w-3.5 h-3.5" />
                      {meta.label}
                    </div>
                  )}

                  {entry.lessons && (
                    <div className="text-sm text-gray-700 dark:text-zinc-300 bg-gray-50 dark:bg-zinc-800/60 border-l-2 border-indigo-400 dark:border-indigo-600 rounded-r px-3 py-2 leading-relaxed whitespace-pre-wrap">
                      {entry.lessons}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  if (hasFilters) {
    return (
      <div className="text-center py-16">
        <Filter className="w-8 h-8 mx-auto text-gray-300 dark:text-zinc-700 mb-3" />
        <p className="text-sm text-gray-500 dark:text-zinc-400">No entries match these filters.</p>
      </div>
    );
  }
  return (
    <div className="text-center py-16">
      <BookOpen className="w-8 h-8 mx-auto text-gray-300 dark:text-zinc-700 mb-3" />
      <p className="text-sm text-gray-700 dark:text-zinc-300 font-medium">Nothing in the journal yet.</p>
      <p className="text-xs text-gray-500 dark:text-zinc-500 mt-1 max-w-sm mx-auto">
        When you close a thesis on a stock page, it lands here with the outcome and what you learned.
      </p>
    </div>
  );
}
