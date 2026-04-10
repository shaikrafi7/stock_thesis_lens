"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

const GaugeComponent = dynamic(() => import("react-gauge-component"), { ssr: false });

const TOOLTIP_STYLE = {
  fontSize: "12px",
  backgroundColor: "#18181b",
  color: "#fafafa",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "8px",
  padding: "4px 8px",
};

const scoreColor = (score: number) =>
  score >= 80 ? "#22c55e" : score >= 60 ? "#a3e635" : score >= 40 ? "#eab308" : "#ef4444";

const scoreLabel = (score: number) =>
  score >= 80 ? "Thesis Strong" : score >= 60 ? "Holding" : score >= 40 ? "Under Pressure" : "At Risk";

const ZONES = [
  { color: "#ef4444", label: "At Risk", range: "0\u201340" },
  { color: "#eab308", label: "Under Pressure", range: "40\u201360" },
  { color: "#a3e635", label: "Holding", range: "60\u201380" },
  { color: "#22c55e", label: "Thesis Strong", range: "80\u2013100" },
];

export default function PortfolioGauge({ avgScore, hasEvaluations = true }: { avgScore: number; hasEvaluations?: boolean }) {
  const [hoveredZone, setHoveredZone] = useState<number | null>(null);
  const color = scoreColor(avgScore);

  return (
    <div className="relative flex flex-col items-center py-4 mb-4 rounded-2xl overflow-hidden bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-lg">
      <p className="text-xs uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-1 relative z-10">
        Portfolio Thesis Health
      </p>
      <div className="relative z-10 w-full flex justify-center mb-0">
        <GaugeComponent
          type="semicircle"
          value={avgScore}
          minValue={0}
          maxValue={100}
          arc={{
            subArcs: [
              { limit: 40, color: "#ef4444", tooltip: { text: "At Risk (0\u201340)", style: TOOLTIP_STYLE } },
              { limit: 60, color: "#eab308", tooltip: { text: "Under Pressure (40\u201360)", style: TOOLTIP_STYLE } },
              { limit: 80, color: "#a3e635", tooltip: { text: "Holding (60\u201380)", style: TOOLTIP_STYLE } },
              { limit: 100, color: "#22c55e", tooltip: { text: "Thesis Strong (80\u2013100)", style: TOOLTIP_STYLE } },
            ],
            padding: 0.02,
            width: 0.25,
          }}
          pointer={{ type: "needle", color, animate: true, animationDelay: 0, length: 0.7, width: 15 }}
          labels={{ valueLabel: { hide: true }, tickLabels: { hideMinMax: true, ticks: [] } }}
          style={{ width: "100%", maxWidth: "340px" }}
        />
      </div>
      <div className="text-center mt-4 relative z-10">
        {hasEvaluations ? (
          <>
            <span
              className="text-4xl font-mono font-bold text-gray-900 dark:text-white"
              style={{ textShadow: `0 0 20px ${color}40, 0 0 40px ${color}20` }}
            >
              {avgScore.toFixed(1)}
            </span>
            <span className="text-gray-400 dark:text-zinc-500 text-sm ml-1">/100</span>
            <p className="text-xs mt-1 font-semibold tracking-wide" style={{ color }}>
              {scoreLabel(avgScore)}
            </p>
          </>
        ) : (
          <>
            <span className="text-2xl font-mono font-bold text-gray-400 dark:text-zinc-500">--</span>
            <span className="text-gray-400 dark:text-zinc-500 text-sm ml-1">/100</span>
            <p className="text-xs mt-1 text-gray-400 dark:text-zinc-500">No evaluations yet</p>
          </>
        )}
      </div>

      {/* Zone legend with hover tooltips */}
      <div className="flex gap-3 mt-3 relative z-10">
        {ZONES.map((zone, i) => (
          <div
            key={i}
            className="relative flex items-center gap-1 cursor-default"
            onMouseEnter={() => setHoveredZone(i)}
            onMouseLeave={() => setHoveredZone(null)}
          >
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: zone.color }} />
            <span className="text-[9px] text-gray-400 dark:text-zinc-500">{zone.label}</span>
            {hoveredZone === i && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-800 dark:bg-zinc-800 border border-gray-700 dark:border-zinc-700 rounded text-[10px] text-gray-100 dark:text-zinc-300 whitespace-nowrap z-20">
                {zone.range}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
