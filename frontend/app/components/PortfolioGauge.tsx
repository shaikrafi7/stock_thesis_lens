"use client";

import GaugeComponent from "react-gauge-component";

const scoreColor = (score: number) =>
  score >= 75 ? "#22c55e" : score >= 50 ? "#eab308" : "#ef4444";

const scoreLabel = (score: number) =>
  score >= 75 ? "Thesis Strong" : score >= 50 ? "Under Pressure" : "At Risk";

export default function PortfolioGauge({ avgScore }: { avgScore: number }) {
  return (
    <div className="flex flex-col items-center py-6 mb-8 bg-surface/80 backdrop-blur-sm border border-zinc-800 rounded-2xl">
      <p className="text-xs uppercase tracking-widest text-zinc-500 mb-1">
        Portfolio Thesis Health
      </p>
      <GaugeComponent
        type="semicircle"
        value={avgScore}
        minValue={0}
        maxValue={100}
        arc={{
          colorArray: ["#ef4444", "#eab308", "#22c55e"],
          subArcs: [{ limit: 50 }, { limit: 75 }, { limit: 100 }],
          padding: 0.02,
          width: 0.25,
        }}
        pointer={{
          color: scoreColor(avgScore),
          animationDelay: 0,
        }}
        labels={{
          valueLabel: { hide: true },
          tickLabels: { hideMinMax: true, ticks: [] },
        }}
        style={{ width: "100%", maxWidth: "320px" }}
      />
      <div className="text-center mt-2">
        <span className="text-4xl font-mono font-bold text-white">
          {avgScore.toFixed(1)}
        </span>
        <span className="text-zinc-500 text-sm ml-1">/100</span>
        <p
          className="text-xs mt-1 font-semibold tracking-wide"
          style={{ color: scoreColor(avgScore) }}
        >
          {scoreLabel(avgScore)}
        </p>
      </div>
    </div>
  );
}
