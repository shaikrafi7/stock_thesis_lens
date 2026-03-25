import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

const STATUS_CONFIG: Record<string, { style: string; label: string; Icon: typeof CheckCircle2 }> = {
  green: { style: "bg-emerald-950/60 text-emerald-400 border-emerald-800", label: "Intact", Icon: CheckCircle2 },
  yellow: { style: "bg-amber-950/60 text-amber-400 border-amber-800", label: "Pressure", Icon: AlertTriangle },
  red: { style: "bg-red-950/60 text-red-400 border-red-800", label: "Breaking", Icon: XCircle },
};

export default function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { style: "bg-zinc-800 text-zinc-400 border-zinc-600", label: status, Icon: AlertTriangle };
  const { style, label, Icon } = config;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${style}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}
