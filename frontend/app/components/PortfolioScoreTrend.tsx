"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { EvaluationSummary } from "@/lib/api";

const COLORS = [
  "#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4",
  "#a855f7", "#ec4899", "#84cc16", "#f97316", "#14b8a6",
];

interface Props {
  scoreHistories: Record<string, EvaluationSummary[]>;
}

export default function PortfolioScoreTrend({ scoreHistories }: Props) {
  const tickers = Object.keys(scoreHistories).filter((t) => scoreHistories[t].length >= 2);
  if (tickers.length < 2) return null;

  // Build a unified timeline: collect all timestamps, sort, merge per-ticker scores
  const allDates = Array.from(
    new Set(
      tickers.flatMap((t) =>
        scoreHistories[t].map((e) =>
          new Date(e.timestamp).toLocaleDateString("default", { month: "short", day: "numeric" })
        )
      )
    )
  ).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  // For each ticker build a lookup date→score
  const lookup: Record<string, Record<string, number>> = {};
  for (const t of tickers) {
    lookup[t] = {};
    for (const e of scoreHistories[t]) {
      const d = new Date(e.timestamp).toLocaleDateString("default", { month: "short", day: "numeric" });
      lookup[t][d] = Math.round(e.score);
    }
  }

  const chartData = allDates.map((d) => {
    const row: Record<string, string | number> = { date: d };
    for (const t of tickers) {
      if (lookup[t][d] != null) row[t] = lookup[t][d];
    }
    return row;
  });

  return (
    <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
      <p className="text-xs uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-3">Score Trends</p>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "#71717a" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: "#71717a" }}
            tickLine={false}
            axisLine={false}
            tickCount={3}
          />
          <Tooltip
            contentStyle={{ backgroundColor: "#ffffff", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "11px" }}
            labelStyle={{ color: "#6b7280" }}
            formatter={(value, name) => [`${value}/100`, name as string]}
          />
          <ReferenceLine y={75} stroke="#22c55e" strokeDasharray="3 3" strokeOpacity={0.25} />
          <ReferenceLine y={50} stroke="#eab308" strokeDasharray="3 3" strokeOpacity={0.25} />
          {tickers.map((t, i) => (
            <Line
              key={t}
              type="monotone"
              dataKey={t}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {tickers.map((t, i) => (
          <span key={t} className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-zinc-400">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
