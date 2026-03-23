"use client";

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { fetchMarketData, type MarketData } from "@/lib/api";

function fmt(n: number | null | undefined, style: "currency" | "percent" | "decimal", decimals = 2) {
  if (n == null) return "—";
  if (style === "currency") {
    if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    return `$${n.toLocaleString()}`;
  }
  if (style === "percent") return `${(n * 100).toFixed(1)}%`;
  return n.toFixed(decimals);
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-zinc-800 last:border-0">
      <span className="text-zinc-500 text-xs">{label}</span>
      <span className="text-zinc-200 text-xs font-medium">{value}</span>
    </div>
  );
}

export default function StockInfoPanel({ ticker }: { ticker: string }) {
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetchMarketData(ticker)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [ticker]);

  if (loading) {
    return (
      <div className="flex flex-col gap-3 animate-pulse">
        <div className="h-40 bg-zinc-800 rounded-lg" />
        <div className="h-5 bg-zinc-800 rounded w-2/3" />
        <div className="h-4 bg-zinc-800 rounded w-1/2" />
        <div className="h-4 bg-zinc-800 rounded w-3/4" />
        <div className="h-4 bg-zinc-800 rounded w-1/2" />
      </div>
    );
  }

  if (error || !data) {
    return <p className="text-red-400 text-sm">{error || "No data"}</p>;
  }

  const { company, prices } = data;

  // Price delta vs first price
  const firstClose = prices[0]?.close ?? 0;
  const lastClose = prices[prices.length - 1]?.close ?? 0;
  const delta = firstClose > 0 ? ((lastClose - firstClose) / firstClose) * 100 : 0;
  const positive = delta >= 0;

  // Thin out x-axis labels (show ~5 evenly spaced)
  const xTicks = prices
    .filter((_, i) => i % Math.floor(prices.length / 5) === 0)
    .map((p) => p.date);

  return (
    <div className="flex flex-col gap-4">
      {/* Company name + 3-month delta */}
      <div>
        {company.name && (
          <p className="text-white font-semibold text-sm leading-tight">{company.name}</p>
        )}
        {company.sector && (
          <p className="text-zinc-500 text-xs mt-0.5">{company.sector} · {company.industry}</p>
        )}
        <p className={`text-sm font-mono font-bold mt-1 ${positive ? "text-green-400" : "text-red-400"}`}>
          ${lastClose.toFixed(2)}{" "}
          <span className="text-xs font-normal">
            {positive ? "▲" : "▼"} {Math.abs(delta).toFixed(2)}% (3mo)
          </span>
        </p>
      </div>

      {/* Price chart */}
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={prices} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={positive ? "#22c55e" : "#ef4444"} stopOpacity={0.3} />
                <stop offset="95%" stopColor={positive ? "#22c55e" : "#ef4444"} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              ticks={xTicks}
              tickFormatter={(v: string) => {
                const d = new Date(v);
                return `${d.toLocaleString("default", { month: "short" })} ${d.getDate()}`;
              }}
              tick={{ fill: "#71717a", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fill: "#71717a", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={45}
              tickFormatter={(v: number) => `$${v.toFixed(0)}`}
            />
            <Tooltip
              contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 6, fontSize: 12 }}
              labelStyle={{ color: "#a1a1aa" }}
              itemStyle={{ color: "#e4e4e7" }}
              formatter={(v) => [`$${Number(v).toFixed(2)}`, "Close"]}
            />
            <Area
              type="monotone"
              dataKey="close"
              stroke={positive ? "#22c55e" : "#ef4444"}
              strokeWidth={1.5}
              fill="url(#priceGrad)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Stats */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1">
        <StatRow label="Market Cap" value={fmt(company.market_cap, "currency")} />
        <StatRow label="Beta" value={fmt(company.beta, "decimal")} />
        <StatRow label="Analyst Target" value={company.analyst_target != null ? `$${company.analyst_target.toFixed(2)}` : "—"} />
        <StatRow label="Institutional Own." value={fmt(company.institutional_ownership, "percent")} />
      </div>
    </div>
  );
}
