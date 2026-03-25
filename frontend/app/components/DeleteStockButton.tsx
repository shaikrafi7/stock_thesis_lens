"use client";

import { useState } from "react";
import { deleteStock } from "@/lib/api";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";

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
      className="text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-50 p-1 rounded hover:bg-red-950/30"
      title="Remove from portfolio"
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
    </button>
  );
}
