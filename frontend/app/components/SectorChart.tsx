"use client";

import { useEffect, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { getPortfolioSectors, type SectorEntry } from "@/lib/api";
import { ChevronUp, ChevronDown, PieChart as PieIcon, Loader2 } from "lucide-react";

const COLORS = [
  "#2962ff", "#26a69a", "#f59e0b", "#ef5350", "#42a5f5",
  "#ab47bc", "#66bb6a", "#ff7043", "#5c6bc0", "#8d6e63",
  "#78909c", "#ec407a",
];

interface SectorData {
  name: string;
  value: number;
  tickers: string[];
}

export default function SectorChart({ compact = false, portfolioId }: { compact?: boolean; portfolioId?: number | null }) {
  const [data, setData] = useState<SectorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    getPortfolioSectors(portfolioId)
      .then((entries: SectorEntry[]) => {
        const grouped: Record<string, string[]> = {};
        for (const e of entries) {
          const sector = e.sector || "Unknown";
          if (!grouped[sector]) grouped[sector] = [];
          grouped[sector].push(e.ticker);
        }
        const chartData = Object.entries(grouped)
          .map(([name, tickers]) => ({ name, value: tickers.length, tickers }))
          .sort((a, b) => b.value - a.value);
        setData(chartData);
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [portfolioId]);

  if (loading) {
    return (
      <div className="p-3 animate-pulse">
        <div className="h-3 bg-zinc-800 rounded w-24 mb-3" />
        <div className={`bg-zinc-800 rounded ${compact ? "h-24" : "h-32"}`} />
      </div>
    );
  }

  if (data.length === 0) return null;

  const innerR = compact ? 22 : 35;
  const outerR = compact ? 45 : 65;

  return (
    <div className={compact ? "" : "border border-zinc-800 rounded-2xl overflow-hidden bg-surface/50"}>
      <div
        onClick={() => setCollapsed((c) => !c)}
        className={`flex items-center justify-between ${compact ? "px-3 py-2" : "px-4 py-3"} bg-surface hover:bg-surface-raised/50 transition-colors cursor-pointer select-none`}
      >
        <div className="flex items-center gap-2">
          <PieIcon className="w-3.5 h-3.5 text-zinc-500" />
          <span className={`uppercase tracking-widest text-zinc-500 font-semibold ${compact ? "text-[10px]" : "text-xs"}`}>
            Sectors
          </span>
        </div>
        {collapsed ? (
          <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
        ) : (
          <ChevronUp className="w-3.5 h-3.5 text-zinc-500" />
        )}
      </div>

      {!collapsed && (
        <div className={compact ? "px-2 pb-2" : "px-4 pb-4"}>
          <div className={compact ? "h-28" : "h-44"}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={innerR}
                  outerRadius={outerR}
                  paddingAngle={2}
                  dataKey="value"
                  isAnimationActive={false}
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#1e222d",
                    border: "1px solid #363a45",
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                  formatter={(value, name) => [
                    `${value} stock${Number(value) > 1 ? "s" : ""}`,
                    String(name),
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className={`flex flex-col gap-0.5 mt-1 ${compact ? "" : "flex-row flex-wrap gap-x-3 gap-y-1"}`}>
            {data.map((entry, i) => (
              <div key={entry.name} className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                <span className={`text-zinc-400 ${compact ? "text-[9px]" : "text-[10px]"}`}>
                  {entry.name}
                  <span className="text-zinc-600 ml-0.5">
                    ({entry.tickers.join(", ")})
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
