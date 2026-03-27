"use client";

import { useState, useEffect } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { getEvaluationHistory, type EvaluationSummary } from "@/lib/api";
import { ChevronUp, ChevronDown } from "lucide-react";

interface Props {
  ticker: string;
}

export default function ScoreHistoryChart({ ticker }: Props) {
  const [history, setHistory] = useState<EvaluationSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    getEvaluationHistory(ticker, 30)
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [ticker]);

  if (loading) {
    return (
      <div className="animate-pulse bg-surface border border-zinc-800 rounded-xl p-4">
        <div className="h-3 bg-zinc-800 rounded w-28 mb-3" />
        <div className="h-32 bg-zinc-800 rounded" />
      </div>
    );
  }

  if (!history || history.length < 2) return null;

  const data = history.map((e) => ({
    date: new Date(e.timestamp).toLocaleDateString("default", {
      month: "short",
      day: "numeric",
    }),
    score: Math.round(e.score * 10) / 10,
    status: e.status,
  }));

  const latest = data[data.length - 1];
  const first = data[0];
  const delta = latest.score - first.score;
  const trendColor = delta > 0 ? "#22c55e" : delta < 0 ? "#ef4444" : "#eab308";

  return (
    <div className="bg-surface border border-zinc-800 rounded-xl overflow-hidden">
      <div
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-surface-raised/50 transition-colors select-none"
      >
        <p className="text-xs uppercase tracking-widest text-zinc-500">Score History</p>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono text-zinc-400">{history.length} evals</span>
          <span
            className="text-xs font-mono font-bold"
            style={{ color: trendColor }}
          >
            {delta > 0 ? "+" : ""}{delta.toFixed(1)}
          </span>
          {open ? <ChevronUp className="w-3.5 h-3.5 text-zinc-500" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />}
        </div>
      </div>
      {open && (
        <div className="px-4 pb-4 min-w-0 overflow-hidden">
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={trendColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={trendColor} stopOpacity={0} />
                </linearGradient>
              </defs>
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
                contentStyle={{
                  backgroundColor: "#18181b",
                  border: "1px solid #3f3f46",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                labelStyle={{ color: "#a1a1aa" }}
                itemStyle={{ color: "#e4e4e7" }}
                formatter={(value) => [`${value}/100`, "Score"]}
              />
              <ReferenceLine y={75} stroke="#22c55e" strokeDasharray="3 3" strokeOpacity={0.3} />
              <ReferenceLine y={50} stroke="#eab308" strokeDasharray="3 3" strokeOpacity={0.3} />
              <Area
                type="monotone"
                dataKey="score"
                stroke={trendColor}
                strokeWidth={2}
                fill="url(#scoreGrad)"
                dot={false}
                activeDot={{ r: 3, fill: trendColor }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
