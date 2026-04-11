"use client";

import { use, useEffect, useState } from "react";
import { getSharedThesis, type PublicShareResponse } from "@/lib/api";
import { Loader2, Lock, Star, Zap, ThumbsUp, ThumbsDown } from "lucide-react";
import StatusBadge from "@/app/components/StatusBadge";

const CATEGORY_LABELS: Record<string, string> = {
  competitive_moat: "Competitive Moat",
  growth_trajectory: "Growth Trajectory",
  valuation: "Valuation",
  financial_health: "Financial Health",
  ownership_conviction: "Ownership & Conviction",
  risks: "Risks & Bear Case",
};

const CATEGORY_ORDER = [
  "competitive_moat", "growth_trajectory", "valuation",
  "financial_health", "ownership_conviction", "risks",
];

interface Props {
  params: Promise<{ token: string }>;
}

export default function SharePage({ params }: Props) {
  const { token } = use(params);
  const [data, setData] = useState<PublicShareResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getSharedThesis(token)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Not found"))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        {error || "Thesis not found"}
      </div>
    );
  }

  const grouped: Record<string, typeof data.theses> = {};
  for (const t of data.theses) {
    if (!grouped[t.category]) grouped[t.category] = [];
    grouped[t.category].push(t);
  }

  const cats = [...CATEGORY_ORDER, ...Object.keys(grouped).filter((c) => !CATEGORY_ORDER.includes(c))];

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        {data.logo_url && (
          <img src={data.logo_url} alt={data.ticker} className="w-10 h-10 rounded-lg object-contain border border-gray-200 dark:border-zinc-700" />
        )}
        <div>
          <h1 className="text-2xl font-mono font-bold text-gray-900 dark:text-white">{data.ticker}</h1>
          <p className="text-gray-400 dark:text-zinc-500 text-sm">{data.name}</p>
        </div>
        {data.evaluation && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-2xl font-mono font-bold text-gray-900 dark:text-white">{data.evaluation.score}/100</span>
            <StatusBadge status={data.evaluation.status as "green" | "yellow" | "red"} />
          </div>
        )}
      </div>

      {data.evaluation?.explanation && (
        <p className="text-sm text-gray-600 dark:text-zinc-300 leading-relaxed border-l-2 border-gray-300 dark:border-zinc-600 pl-3">
          {data.evaluation.explanation}
        </p>
      )}

      {/* Thesis points */}
      <div className="flex flex-col gap-5">
        {cats.map((cat) => {
          const items = grouped[cat];
          if (!items?.length) return null;
          return (
            <div key={cat}>
              <h3 className="text-xs uppercase tracking-widest text-gray-400 dark:text-zinc-500 font-medium mb-2">
                {CATEGORY_LABELS[cat] ?? cat}
              </h3>
              <div className="flex flex-col gap-1">
                {items.map((t, i) => (
                  <div key={i} className={`flex items-start gap-2 px-3 py-2.5 rounded-lg text-sm ${
                    t.frozen
                      ? "border-l-2 border-amber-400 bg-amber-50 dark:bg-amber-950/20"
                      : t.conviction === "liked"
                      ? "border-l-2 border-green-500 bg-green-50 dark:bg-green-950/20"
                      : t.conviction === "disliked"
                      ? "border-l-2 border-red-400 bg-red-50 dark:bg-red-950/20"
                      : "bg-white dark:bg-zinc-800/50 border border-gray-100 dark:border-zinc-700/50"
                  }`}>
                    {t.importance === "critical" && <Zap className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />}
                    {t.importance === "important" && <Star className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />}
                    {t.frozen && <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />}
                    <span className="text-gray-800 dark:text-zinc-200 leading-relaxed flex-1">{t.statement}</span>
                    {t.conviction === "liked" && <ThumbsUp className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />}
                    {t.conviction === "disliked" && <ThumbsDown className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-gray-300 dark:text-zinc-600 text-center pt-2">
        Shared via ThesisArc · Not financial advice
      </p>
    </div>
  );
}
