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
import { TrendingUp, TrendingDown, ChevronUp, ChevronDown, Settings2, X } from "lucide-react";

function fmt(n: number | null | undefined, style: "currency" | "percent" | "decimal", decimals = 2) {
  if (n == null) return "\u2014";
  if (style === "currency") {
    if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    return `$${n.toLocaleString()}`;
  }
  if (style === "percent") return `${(n * 100).toFixed(1)}%`;
  return n.toFixed(decimals);
}

function fmtRec(rec: string | null): string {
  if (!rec) return "\u2014";
  const map: Record<string, string> = {
    strong_buy: "Strong Buy",
    buy: "Buy",
    hold: "Hold",
    sell: "Sell",
    strong_sell: "Strong Sell",
  };
  return map[rec] ?? rec.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function recColor(rec: string | null): string {
  if (!rec) return "text-zinc-400";
  if (rec.includes("buy")) return "text-green-400";
  if (rec.includes("sell")) return "text-red-400";
  return "text-yellow-400";
}

interface StatItem {
  key: string;
  label: string;
  value: string;
  group: "overview" | "valuation" | "analyst" | "dividend";
}

const STORAGE_KEY = "stock_info_hidden_stats";

function loadHiddenStats(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveHiddenStats(hidden: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...hidden]));
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-zinc-800/50 last:border-0">
      <span className="text-zinc-500 text-xs">{label}</span>
      <span className="text-zinc-200 text-xs font-medium">{value}</span>
    </div>
  );
}

export default function StockInfoPanel({ ticker }: { ticker: string }) {
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [hiddenStats, setHiddenStats] = useState<Set<string>>(new Set());

  useEffect(() => {
    setHiddenStats(loadHiddenStats());
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    fetchMarketData(ticker)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [ticker]);

  function toggleStat(key: string) {
    setHiddenStats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      saveHiddenStats(next);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-3 animate-pulse">
        <div className="h-40 bg-zinc-800 rounded-xl" />
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

  // Analyst upside/downside %
  const analystUpside = company.analyst_target && lastClose > 0
    ? ((company.analyst_target - lastClose) / lastClose) * 100
    : null;

  // 52-week position
  const week52Position = company.fifty_two_week_low != null && company.fifty_two_week_high != null
    && company.fifty_two_week_high > company.fifty_two_week_low
    ? ((lastClose - company.fifty_two_week_low) / (company.fifty_two_week_high - company.fifty_two_week_low)) * 100
    : null;

  // Thin out x-axis labels
  const xTicks = prices
    .filter((_, i) => i % Math.floor(prices.length / 5) === 0)
    .map((p) => p.date);

  // Build all stat items
  const allStats: StatItem[] = [
    { key: "market_cap", label: "Market Cap", value: fmt(company.market_cap, "currency"), group: "overview" },
    { key: "beta", label: "Beta", value: fmt(company.beta, "decimal"), group: "overview" },
    { key: "52w_range", label: "52-Week Range", value: company.fifty_two_week_low != null && company.fifty_two_week_high != null ? `$${company.fifty_two_week_low.toFixed(2)} — $${company.fifty_two_week_high.toFixed(2)}` : "\u2014", group: "overview" },
    { key: "52w_position", label: "52-Week Position", value: week52Position != null ? `${week52Position.toFixed(0)}%` : "\u2014", group: "overview" },
    { key: "inst_own", label: "Institutional Own.", value: fmt(company.institutional_ownership, "percent"), group: "overview" },
    { key: "short_pct", label: "Short Interest", value: company.short_percent != null ? `${(company.short_percent * 100).toFixed(1)}%` : "\u2014", group: "overview" },

    { key: "recommendation", label: "Analyst Rating", value: fmtRec(company.recommendation), group: "analyst" },
    { key: "analyst_count", label: "# Analysts", value: company.analyst_count != null ? String(company.analyst_count) : "\u2014", group: "analyst" },
    { key: "analyst_target", label: "Avg Target", value: company.analyst_target != null ? `$${company.analyst_target.toFixed(2)}` : "\u2014", group: "analyst" },
    { key: "analyst_upside", label: "Target Upside", value: analystUpside != null ? `${analystUpside > 0 ? "+" : ""}${analystUpside.toFixed(1)}%` : "\u2014", group: "analyst" },
    { key: "target_range", label: "Target Range", value: company.target_low != null && company.target_high != null ? `$${company.target_low.toFixed(2)} — $${company.target_high.toFixed(2)}` : "\u2014", group: "analyst" },

    { key: "trailing_pe", label: "P/E (TTM)", value: fmt(company.trailing_pe, "decimal"), group: "valuation" },
    { key: "forward_pe", label: "P/E (Fwd)", value: fmt(company.forward_pe, "decimal"), group: "valuation" },
    { key: "peg_ratio", label: "PEG Ratio", value: fmt(company.peg_ratio, "decimal"), group: "valuation" },
    { key: "price_to_book", label: "P/B Ratio", value: fmt(company.price_to_book, "decimal"), group: "valuation" },
    { key: "eps_trailing", label: "EPS (TTM)", value: company.eps_trailing != null ? `$${company.eps_trailing.toFixed(2)}` : "\u2014", group: "valuation" },
    { key: "eps_forward", label: "EPS (Fwd)", value: company.eps_forward != null ? `$${company.eps_forward.toFixed(2)}` : "\u2014", group: "valuation" },
    { key: "profit_margin", label: "Profit Margin", value: fmt(company.profit_margin, "percent"), group: "valuation" },
    { key: "revenue_growth", label: "Revenue Growth", value: fmt(company.revenue_growth, "percent"), group: "valuation" },

    { key: "div_yield", label: "Dividend Yield", value: company.dividend_yield != null ? `${(company.dividend_yield * 100).toFixed(2)}%` : "\u2014", group: "dividend" },
    { key: "ex_div_date", label: "Ex-Dividend Date", value: company.ex_dividend_date ?? "\u2014", group: "dividend" },
  ];

  const visibleStats = allStats.filter((s) => !hiddenStats.has(s.key));

  const GROUP_LABELS: Record<string, string> = {
    overview: "Overview",
    analyst: "Analyst Consensus",
    valuation: "Valuation & Earnings",
    dividend: "Dividend",
  };

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
        <div className={`flex items-center gap-1.5 mt-1 ${positive ? "text-green-400" : "text-red-400"}`}>
          {positive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          <span className="text-sm font-mono font-bold">
            ${lastClose.toFixed(2)}
          </span>
          <span className="text-xs font-normal">
            {positive ? "+" : ""}{delta.toFixed(2)}% (3mo)
          </span>
        </div>
        {/* Analyst recommendation badge */}
        {company.recommendation && (
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`text-xs font-semibold ${recColor(company.recommendation)}`}>
              {fmtRec(company.recommendation)}
            </span>
            {analystUpside != null && (
              <span className={`text-xs font-mono ${analystUpside >= 0 ? "text-green-400" : "text-red-400"}`}>
                ({analystUpside > 0 ? "+" : ""}{analystUpside.toFixed(1)}% upside)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Price chart */}
      <div className="h-40 bg-surface rounded-xl p-2 border border-zinc-800">
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
              contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 12 }}
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

      {/* Stats panel — collapsible */}
      <div className="bg-surface border border-zinc-800 rounded-xl overflow-hidden">
        <div
          onClick={() => setCollapsed((c) => !c)}
          className="w-full flex items-center justify-between px-3 py-2 hover:bg-surface-raised/50 transition-colors cursor-pointer select-none"
        >
          <span className="text-xs uppercase tracking-widest text-zinc-500 font-medium">Key Metrics</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={(e) => { e.stopPropagation(); setShowSettings((s) => !s); }}
              className="p-0.5 rounded hover:bg-zinc-700 text-zinc-600 hover:text-zinc-400 transition-colors"
              title="Customize visible metrics"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
            {collapsed ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500" /> : <ChevronUp className="w-3.5 h-3.5 text-zinc-500" />}
          </div>
        </div>

        {/* Settings dropdown */}
        {showSettings && (
          <div className="border-t border-zinc-800 px-3 py-2 bg-zinc-900">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500">Toggle Metrics</span>
              <button onClick={() => setShowSettings(false)} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {allStats.map((s) => (
                <button
                  key={s.key}
                  onClick={() => toggleStat(s.key)}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                    hiddenStats.has(s.key)
                      ? "border-zinc-700 text-zinc-600 bg-transparent"
                      : "border-accent/50 text-accent bg-accent/10"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {!collapsed && (
          <div className="px-3 py-1">
            {(["overview", "analyst", "valuation", "dividend"] as const).map((group) => {
              const groupStats = visibleStats.filter((s) => s.group === group);
              if (groupStats.length === 0) return null;
              return (
                <div key={group}>
                  <p className="text-[10px] uppercase tracking-widest text-zinc-600 mt-2 mb-0.5">{GROUP_LABELS[group]}</p>
                  {groupStats.map((s) => (
                    <StatRow key={s.key} label={s.label} value={s.value} />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
