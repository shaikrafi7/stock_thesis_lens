"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { evaluateAll } from "@/lib/api";
import { Activity, Loader2 } from "lucide-react";

export default function EvaluateAllButton({ portfolioId }: { portfolioId?: number | null } = {}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    evaluated: string[];
    skipped: string[];
  } | null>(null);

  async function handleClick() {
    setLoading(true);
    setResult(null);
    try {
      const res = await evaluateAll(portfolioId);
      setResult({ evaluated: res.evaluated, skipped: res.skipped });
      router.refresh();
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleClick}
        disabled={loading}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent hover:bg-accent-hover disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-lg transition-colors font-medium"
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Activity className="w-3.5 h-3.5" />
        )}
        {loading ? "Evaluating\u2026" : "Evaluate All"}
      </button>
      {result && (
        <span className="text-zinc-500 text-[10px]">
          {result.evaluated.length} evaluated, {result.skipped.length} skipped
        </span>
      )}
    </div>
  );
}
