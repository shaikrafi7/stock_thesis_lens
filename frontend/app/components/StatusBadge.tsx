const STATUS_STYLES: Record<string, string> = {
  green: "bg-emerald-900 text-emerald-400 border-emerald-700",
  yellow: "bg-amber-900 text-amber-400 border-amber-700",
  red: "bg-red-900 text-red-400 border-red-700",
};

const STATUS_LABELS: Record<string, string> = {
  green: "✓ Intact",
  yellow: "⚠ Pressure",
  red: "✗ Breaking",
};

export default function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-zinc-800 text-zinc-400 border-zinc-600";
  const label = STATUS_LABELS[status] ?? status;
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-medium ${style}`}>
      {label}
    </span>
  );
}
