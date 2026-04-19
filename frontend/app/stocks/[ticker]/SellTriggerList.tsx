"use client";

import { useEffect, useState } from "react";
import {
  listTriggers,
  createTrigger,
  updateTrigger,
  deleteTrigger,
  type SellTrigger,
} from "@/lib/api";
import { AlertTriangle, Bell, Plus, X, Check } from "lucide-react";

const METRIC_LABEL: Record<SellTrigger["metric"], string> = {
  price: "Price",
  change_pct: "Daily change %",
  pe_ratio: "P/E ratio",
  score: "Thesis score",
};

export default function SellTriggerList({ thesisId }: { thesisId: number }) {
  const [triggers, setTriggers] = useState<SellTrigger[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [metric, setMetric] = useState<SellTrigger["metric"]>("price");
  const [operator, setOperator] = useState<SellTrigger["operator"]>("<");
  const [threshold, setThreshold] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function refresh() {
    try {
      setTriggers(await listTriggers(thesisId));
    } catch {
      setTriggers([]);
    }
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [thesisId]);

  async function handleCreate() {
    const num = Number(threshold);
    if (!Number.isFinite(num)) return;
    setSaving(true);
    try {
      await createTrigger({ thesis_id: thesisId, metric, operator, threshold: num, note: note || null });
      setShowForm(false);
      setThreshold(""); setNote("");
      refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDismiss(id: number) {
    await updateTrigger(id, { status: "dismissed" });
    refresh();
  }

  async function handleDelete(id: number) {
    await deleteTrigger(id);
    refresh();
  }

  if (triggers === null) return null;
  if (triggers.length === 0 && !showForm) {
    return (
      <button
        type="button"
        onClick={() => setShowForm(true)}
        className="inline-flex items-center gap-1 text-[10px] text-gray-400 dark:text-zinc-500 hover:text-accent transition-colors mt-1"
        title="Set a pre-commitment sell rule tied to this point"
      >
        <Plus className="w-3 h-3" /> Add sell trigger
      </button>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {triggers.map((t) => {
        const fired = t.status === "triggered";
        const dismissed = t.status === "dismissed";
        const tone = fired
          ? "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
          : dismissed
          ? "bg-gray-50 dark:bg-zinc-900/40 border-gray-200 dark:border-zinc-800 text-gray-400 dark:text-zinc-500 opacity-70"
          : "bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60 text-amber-700 dark:text-amber-300";
        return (
          <div key={t.id} className={`flex items-center gap-2 text-[11px] border rounded-lg px-2 py-1 ${tone}`}>
            {fired ? <AlertTriangle className="w-3 h-3 shrink-0" /> : <Bell className="w-3 h-3 shrink-0" />}
            <span className="font-medium">{METRIC_LABEL[t.metric] ?? t.metric}</span>
            <span className="font-mono">{t.operator}</span>
            <span className="font-mono">{t.threshold}</span>
            {fired && t.triggered_value != null && (
              <span className="ml-auto font-mono">fired @ {t.triggered_value}</span>
            )}
            {!fired && !dismissed && (
              <span className="ml-auto text-[10px] uppercase tracking-wider opacity-70">watching</span>
            )}
            {dismissed && (
              <span className="ml-auto text-[10px] uppercase tracking-wider">dismissed</span>
            )}
            {!dismissed && (
              <button
                type="button"
                onClick={() => handleDismiss(t.id)}
                className="ml-1 hover:opacity-100 opacity-60"
                title="Dismiss this trigger"
              ><Check className="w-3 h-3" /></button>
            )}
            <button
              type="button"
              onClick={() => handleDelete(t.id)}
              className="hover:opacity-100 opacity-60"
              title="Delete trigger"
            ><X className="w-3 h-3" /></button>
          </div>
        );
      })}

      {showForm ? (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] bg-gray-50 dark:bg-zinc-800/60 border border-gray-200 dark:border-zinc-700 rounded-lg px-2 py-1.5">
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as SellTrigger["metric"])}
            className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded px-1.5 py-0.5 text-[11px]"
          >
            {(Object.keys(METRIC_LABEL) as SellTrigger["metric"][]).map((m) => (
              <option key={m} value={m}>{METRIC_LABEL[m]}</option>
            ))}
          </select>
          <select
            value={operator}
            onChange={(e) => setOperator(e.target.value as SellTrigger["operator"])}
            className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded px-1.5 py-0.5 text-[11px]"
          >
            {(["<", ">", "<=", ">="] as const).map((op) => <option key={op} value={op}>{op}</option>)}
          </select>
          <input
            type="number"
            step="any"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            placeholder="threshold"
            className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded px-1.5 py-0.5 text-[11px] w-20"
          />
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="why (optional)"
            className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded px-1.5 py-0.5 text-[11px] flex-1 min-w-24"
          />
          <button
            type="button"
            disabled={saving || !threshold}
            onClick={handleCreate}
            className="px-2 py-0.5 rounded bg-accent hover:bg-accent-hover text-white disabled:opacity-50"
          >Save</button>
          <button
            type="button"
            onClick={() => { setShowForm(false); setThreshold(""); setNote(""); }}
            className="px-1.5 py-0.5 rounded border border-gray-200 dark:border-zinc-700 hover:bg-white dark:hover:bg-zinc-900"
          >Cancel</button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1 text-[10px] text-gray-400 dark:text-zinc-500 hover:text-accent transition-colors self-start"
        >
          <Plus className="w-3 h-3" /> Add another
        </button>
      )}
    </div>
  );
}
