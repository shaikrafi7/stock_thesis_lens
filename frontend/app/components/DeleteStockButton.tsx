"use client";

import { useState } from "react";
import { deleteStock } from "@/lib/api";
import { useRouter } from "next/navigation";

interface Props {
  ticker: string;
  redirectTo?: string;
}

export default function DeleteStockButton({ ticker, redirectTo }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm(`Remove ${ticker} from your portfolio?`)) return;
    setLoading(true);
    try {
      await deleteStock(ticker);
      if (redirectTo) {
        router.push(redirectTo);
      } else {
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="text-zinc-600 hover:text-red-400 text-xs transition-colors disabled:opacity-50"
      title="Remove from portfolio"
    >
      {loading ? "…" : "✕"}
    </button>
  );
}
