"use client";

import { useEffect, useState } from "react";
import { getEvaluationDelta, type ScoreDelta } from "@/lib/api";
import { TrendingUp, TrendingDown, RefreshCw, CheckCircle, XCircle, ArrowRight } from "lucide-react";

interface Props {
  ticker: string;
  portfolioId?: number | null;
  /** Pass a trigger value that increments when a new evaluation completes */
  evalVersion?: number;
}

export default function ScoreDeltaPanel({ ticker, portfolioId, evalVersion }: Props) {
  const [delta, setDelta] = useState<ScoreDelta | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    getEvaluationDelta(ticker, portfolioId).then(setDelta).catch(() => {});
  }, [ticker, portfolioId, evalVersion]);

  if (!delta?.has_delta) return null;

  const { score_delta, newly_broken = [], newly_confirmed = [], recovered = [] } = delta;
  const totalChanges = newly_broken.length + newly_confirmed.length + recovered.length;
  if (totalChanges === 0 && score_delta === 0) return null;

  const isPositive = (score_delta ?? 0) >= 0;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden text-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        title="See what changed since your last evaluation"
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-gray-400 dark:text-zinc-500" />
          <span className="text-xs font-semibold tracking-wider text-gray-500 dark:text-zinc-400 uppercase">What Changed</span>
          <span className={`font-mono text-xs font-bold px-1.5 py-0.5 rounded ${
            isPositive
              ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400"
              : "bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400"
          }`}>
            {isPositive ? "+" : ""}{score_delta}
          </span>
          {isPositive
            ? <TrendingUp className="w-3.5 h-3.5 text-green-500" />
            : <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
        </div>
        <span className="text-[10px] text-gray-400 dark:text-zinc-600">{open ? "hide" : "details"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3 border-t border-gray-100 dark:border-zinc-800 pt-3">
          <div className="flex items-center gap-2 text-[11px] text-gray-400 dark:text-zinc-500">
            <span className="font-mono">{delta.previous_score?.toFixed(0)}</span>
            <ArrowRight className="w-3 h-3" />
            <span className="font-mono font-bold text-gray-700 dark:text-zinc-300">{delta.current_score?.toFixed(0)}</span>
          </div>

          {newly_broken.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-red-400 mb-1.5 flex items-center gap-1">
                <XCircle className="w-3 h-3" /> Newly Broken ({newly_broken.length})
              </p>
              <ul className="flex flex-col gap-1">
                {newly_broken.map((p, i) => (
                  <li key={i} className="text-xs text-gray-600 dark:text-zinc-400 border-l-2 border-red-300 dark:border-red-700 pl-2 py-0.5">
                    <span className="font-medium text-red-500 dark:text-red-400">−{p.deduction.toFixed(0)}pts</span>{" "}
                    {p.statement}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {recovered.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-green-500 mb-1.5 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Recovered ({recovered.length})
              </p>
              <ul className="flex flex-col gap-1">
                {recovered.map((p, i) => (
                  <li key={i} className="text-xs text-gray-600 dark:text-zinc-400 border-l-2 border-green-300 dark:border-green-700 pl-2 py-0.5">
                    {p.statement}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {newly_confirmed.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-teal-500 mb-1.5 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Newly Confirmed ({newly_confirmed.length})
              </p>
              <ul className="flex flex-col gap-1">
                {newly_confirmed.map((p, i) => (
                  <li key={i} className="text-xs text-gray-600 dark:text-zinc-400 border-l-2 border-teal-300 dark:border-teal-700 pl-2 py-0.5">
                    <span className="font-medium text-teal-500 dark:text-teal-400">+{p.credit.toFixed(0)}pts</span>{" "}
                    {p.statement}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
