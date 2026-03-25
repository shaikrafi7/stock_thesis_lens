"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { evaluateAll } from "@/lib/api";

export default function EvaluateAllButton() {
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
      const res = await evaluateAll();
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
        className="px-3 py-1.5 text-xs bg-blue-700 hover:bg-blue-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded transition-colors"
      >
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
