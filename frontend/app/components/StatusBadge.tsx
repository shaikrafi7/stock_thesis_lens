import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

const STATUS_CONFIG: Record<string, { style: string; label: string; Icon: typeof CheckCircle2 }> = {
  green: { style: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800", label: "Intact", Icon: CheckCircle2 },
  yellow: { style: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-800", label: "Pressure", Icon: AlertTriangle },
  red: { style: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-400 dark:border-red-800", label: "Breaking", Icon: XCircle },
};

export default function StatusBadge({ status, compact = false }: { status: string; compact?: boolean }) {
  const config = STATUS_CONFIG[status] ?? { style: "bg-gray-100 text-gray-500 border-gray-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-600", label: status, Icon: AlertTriangle };
  const { style, label, Icon } = config;
  if (compact) {
    return (
      <span
        className={`inline-flex w-2 h-2 rounded-full shrink-0 ${
          status === "green" ? "bg-emerald-500" : status === "yellow" ? "bg-amber-500" : "bg-red-500"
        }`}
        title={label}
      />
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${style}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}
