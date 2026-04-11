"use client";

import { useState } from "react";
import { deleteStock } from "@/lib/api";
import { usePortfolio } from "@/app/context/PortfolioContext";
import { useRouter } from "next/navigation";
import { Trash2, Loader2, AlertTriangle, X } from "lucide-react";

const REASONS = [
  { id: "thesis_broken", label: "Thesis has been proven wrong", behavioral: null },
  { id: "better_opportunity", label: "Found a better opportunity", behavioral: null },
  { id: "rebalance", label: "Portfolio rebalancing", behavioral: null },
  { id: "price_dropped", label: "Price dropped and I'm worried", behavioral: "panic_sell" },
  { id: "price_surged", label: "Price surged and I want to lock in gains", behavioral: "fomo_exit" },
  { id: "news_scared", label: "Recent news scared me", behavioral: "recency_bias" },
  { id: "other", label: "Other reason", behavioral: null },
];

const BEHAVIORAL_WARNINGS: Record<string, { title: string; body: string }> = {
  panic_sell: {
    title: "Panic sell detected",
    body: "Selling on price drops often locks in losses. Does the original thesis still hold? Price changes alone don't invalidate a thesis.",
  },
  fomo_exit: {
    title: "Premature exit bias",
    body: "Selling winners early is one of the most common investor mistakes. If your thesis is intact, consider whether you would buy more at this price before selling.",
  },
  recency_bias: {
    title: "Recency bias detected",
    body: "Recent news often reverberates more than it should. Step back: does this change your 12-month thesis, or just your mood today?",
  },
};

interface Props {
  ticker: string;
  redirectTo?: string;
}

export default function DeleteStockButton({ ticker, redirectTo }: Props) {
  const { bumpStocksVersion } = usePortfolio();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const reason = REASONS.find((r) => r.id === selectedReason);
  const warning = reason?.behavioral ? BEHAVIORAL_WARNINGS[reason.behavioral] : null;

  async function handleDelete() {
    setLoading(true);
    try {
      await deleteStock(ticker);
      bumpStocksVersion();
      setShowModal(false);
      if (redirectTo) {
        router.push(redirectTo);
      } else {
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  function open() {
    setSelectedReason(null);
    setConfirmed(false);
    setShowModal(true);
  }

  return (
    <>
      <button
        onClick={open}
        disabled={loading}
        className="text-gray-400 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-50 p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30"
        title="Remove from portfolio"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">
                Remove <span className="font-mono">{ticker}</span> from portfolio?
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-gray-500 dark:text-zinc-400 mb-3">Why are you removing it?</p>

            <div className="flex flex-col gap-1.5 mb-4">
              {REASONS.map((r) => (
                <button
                  key={r.id}
                  onClick={() => { setSelectedReason(r.id); setConfirmed(false); }}
                  className={`text-left px-3 py-2 rounded-lg text-xs transition-colors border ${
                    selectedReason === r.id
                      ? "bg-accent/10 border-accent/40 text-accent font-medium"
                      : "bg-gray-50 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-zinc-300 hover:border-gray-300 dark:hover:border-zinc-600"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {warning && !confirmed && (
              <div className="mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                <div className="flex items-center gap-1.5 mb-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">{warning.title}</span>
                </div>
                <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-snug">{warning.body}</p>
                <button
                  onClick={() => setConfirmed(true)}
                  className="mt-2 text-[11px] text-amber-600 dark:text-amber-400 underline hover:no-underline"
                >
                  I understand, proceed anyway
                </button>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-600 dark:text-zinc-400 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={!selectedReason || (!!warning && !confirmed) || loading}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
              >
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
