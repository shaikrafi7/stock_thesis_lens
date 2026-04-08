"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { getPortfolioReturns, type PortfolioReturnsData } from "@/lib/api";
import { Loader2, ChevronDown, ChevronUp } from "lucide-react";

const GaugeComponent = dynamic(() => import("react-gauge-component"), { ssr: false });

const PERIODS = ["1mo", "3mo", "6mo", "1y"] as const;
const PERIOD_LABELS: Record<string, string> = {
  "1mo": "1M",
  "3mo": "3M",
  "6mo": "6M",
  "1y": "1Y",
};

const TOOLTIP_STYLE = {
  fontSize: "12px",
  backgroundColor: "#1e222d",
  color: "#d1d4dc",
  border: "1px solid #363a45",
  borderRadius: "8px",
  padding: "4px 8px",
};

function returnLabel(r: number): string {
  if (r >= 10) return "Outperforming";
  if (r >= 0) return "Positive";
  if (r >= -10) return "Underperforming";
  return "At Risk";
}

function returnColor(r: number): string {
  if (r >= 10) return "#22c55e";
  if (r >= 0) return "#a3e635";
  if (r >= -10) return "#eab308";
  return "#ef4444";
}

function dollarEquivalent(returnPct: number): string {
  const result = 10000 * (1 + returnPct / 100);
  return result.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function PortfolioReturns({ portfolioId }: { portfolioId?: number | null } = {}) {
  const [data, setData] = useState<PortfolioReturnsData | null>(null);
  const [period, setPeriod] = useState<string>("3mo");
  const [loading, setLoading] = useState(true);
  const [barsOpen, setBarsOpen] = useState(false);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    setLoading(true);
    getPortfolioReturns(period, portfolioId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [period, portfolioId]);

  if (loading) {
    return (
      <div className="relative flex flex-col items-center justify-center py-6 rounded-2xl overflow-hidden bg-surface backdrop-blur-md shadow-lg card-border min-h-[120px]">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!data) return null;

  const r = data.portfolio_return;
  const color = returnColor(r);

  // Symmetric gauge range anchored at 0
  const allReturns = [r, data.benchmark_return, ...data.stocks.map((s) => s.return_pct)];
  const absMax = Math.max(...allReturns.map(Math.abs), 5);
  const bound = Math.ceil(absMax / 5) * 5 + 5;
  const rangeMin = -bound;
  const rangeMax = bound;
  const span = rangeMax - rangeMin;

  // Normalized 0-100 for gauge (0% return = 50 = center)
  const normalizedValue = Math.max(0, Math.min(100, ((r - rangeMin) / span) * 100));

  const maxBar = Math.max(...data.stocks.map((s) => Math.abs(s.return_pct)), 1);

  // Tooltip labels for each quarter of the range
  const q1 = Math.round(rangeMin * 0.5);
  const q2 = 0;
  const q3 = Math.round(rangeMax * 0.5);

  return (
    <div className="relative flex flex-col items-center rounded-2xl overflow-hidden bg-surface backdrop-blur-md shadow-lg card-border">
      {/* Glassy overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none" />
      <div className="absolute inset-0 rounded-2xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] pointer-events-none" />

      {/* Header with collapse toggle */}
      <div
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 pt-3 pb-1 cursor-pointer relative z-10"
      >
        <p className="text-xs uppercase tracking-widest text-zinc-500">
          Portfolio Returns
        </p>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-zinc-500" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />}
      </div>

      {open ? (
        <>
          {/* Period selector */}
          <div className="flex gap-1 mb-1 relative z-10">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-2 py-0.5 text-[10px] rounded-md font-medium transition-colors ${
                  period === p
                    ? "bg-accent text-black"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>

          {/* Gauge — per-subArc colors with tooltips (matching ThesisManager pattern) */}
          <div className="relative z-10 w-full flex justify-center mb-0">
            <GaugeComponent
              key={`returns-${normalizedValue.toFixed(1)}`}
              type="semicircle"
              value={normalizedValue}
              minValue={0}
              maxValue={100}
              arc={{
                subArcs: [
                  { limit: 25, color: "#ef4444", tooltip: { text: `At Risk (${rangeMin}% to ${q1}%)`, style: TOOLTIP_STYLE } },
                  { limit: 50, color: "#eab308", tooltip: { text: `Underperforming (${q1}% to ${q2}%)`, style: TOOLTIP_STYLE } },
                  { limit: 75, color: "#a3e635", tooltip: { text: `Positive (${q2}% to ${q3}%)`, style: TOOLTIP_STYLE } },
                  { limit: 100, color: "#22c55e", tooltip: { text: `Outperforming (${q3}% to ${rangeMax}%)`, style: TOOLTIP_STYLE } },
                ],
                padding: 0.02,
                width: 0.25,
              }}
              pointer={{ type: "needle", color, animate: true, animationDelay: 0, length: 0.7, width: 15 }}
              labels={{ valueLabel: { hide: true }, tickLabels: { hideMinMax: true, ticks: [] } }}
              style={{ width: "100%", maxWidth: "280px" }}
            />
          </div>

          {/* Score + label */}
          <div className="text-center mt-3 relative z-10">
            <span
              className="text-3xl font-mono font-bold text-white"
              style={{ textShadow: `0 0 20px ${color}40, 0 0 40px ${color}20` }}
            >
              {r >= 0 ? "+" : ""}{r.toFixed(1)}
            </span>
            <span className="text-zinc-500 text-sm ml-1">%</span>
            <p className="text-xs mt-0.5 font-semibold tracking-wide" style={{ color }}>
              {returnLabel(r)}
            </p>
          </div>

          {/* Benchmark comparison */}
          <div className="mt-2 pb-3 flex flex-col items-center gap-0.5 text-xs relative z-10">
            <span className="text-zinc-500">
              vs S&P 500: <span className="text-zinc-300 font-mono">{data.benchmark_return >= 0 ? "+" : ""}{data.benchmark_return.toFixed(1)}%</span>
            </span>
            <span className={`font-mono font-bold ${data.alpha >= 0 ? "text-green-400" : "text-red-400"}`}>
              Alpha: {data.alpha >= 0 ? "+" : ""}{data.alpha.toFixed(1)}%
            </span>
            <span className="text-zinc-600 text-[11px]">
              $10K &rarr; {dollarEquivalent(r)}
            </span>
          </div>

          {/* Per-stock bars — collapsible */}
          {data.stocks.length > 0 && (
            <div className="w-full px-4 pb-3 relative z-10">
              <div className="border-t border-white/5 pt-2">
                <button
                  onClick={() => setBarsOpen((o) => !o)}
                  className="w-full flex items-center justify-between py-1 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <span className="text-[11px]">
                    {barsOpen ? "Hide returns by stock" : "Show returns by stock"}
                  </span>
                  {barsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                {barsOpen && (
                  <div className="flex flex-col gap-1.5 pt-1">
                    {data.stocks.map((s) => {
                      const pct = Math.abs(s.return_pct) / maxBar;
                      const isPositive = s.return_pct >= 0;
                      return (
                        <div key={s.ticker} className="flex items-center gap-2">
                          <Link
                            href={`/stocks/${s.ticker}`}
                            className="text-[11px] font-mono font-semibold text-zinc-300 hover:text-accent transition-colors w-12 shrink-0"
                          >
                            {s.ticker}
                          </Link>
                          <div className="flex-1 h-3.5 bg-zinc-800/50 rounded-sm overflow-hidden">
                            <div
                              className={`h-full rounded-sm transition-all ${
                                isPositive ? "bg-green-500/60" : "bg-red-500/60"
                              }`}
                              style={{ width: `${Math.max(pct * 100, 2)}%` }}
                            />
                          </div>
                          <span
                            className={`text-[11px] font-mono w-14 text-right shrink-0 ${
                              isPositive ? "text-green-400" : "text-red-400"
                            }`}
                          >
                            {isPositive ? "+" : ""}{s.return_pct.toFixed(1)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        /* Collapsed: just show return value as a compact summary */
        <div className="pb-3 px-4 text-center relative z-10">
          <span className="text-lg font-mono font-bold" style={{ color }}>
            {r >= 0 ? "+" : ""}{r.toFixed(1)}%
          </span>
          <span className="text-zinc-500 text-xs ml-2">
            vs SPY {data.benchmark_return >= 0 ? "+" : ""}{data.benchmark_return.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}
