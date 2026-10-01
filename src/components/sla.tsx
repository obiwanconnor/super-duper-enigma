import type { Clock } from "@/lib/sla/sla";
import { formatBusinessDuration } from "@/lib/sla/business-time";
import { formatDateTime } from "./time";

const styles: Record<Clock["state"], string> = {
  met: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  running: "bg-slate-50 text-slate-700 ring-slate-200",
  at_risk: "bg-amber-50 text-amber-800 ring-amber-200",
  breached: "bg-red-50 text-red-700 ring-red-200",
  paused: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function clockLabel(c: Clock): string {
  switch (c.state) {
    case "met":
      return `Met (${formatBusinessDuration(c.elapsedMinutes)})`;
    case "breached":
      return `Overdue ${formatBusinessDuration(-c.remainingMinutes)}`;
    case "paused":
      return `Paused · ${formatBusinessDuration(c.remainingMinutes)} left`;
    default:
      return `${formatBusinessDuration(c.remainingMinutes)} left`;
  }
}

export function SlaBadge({ clock, prefix }: { clock: Clock; prefix?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${styles[clock.state]}`}
      title={clock.dueAt ? `Due ${formatDateTime(clock.dueAt)} (business hours)` : undefined}
    >
      {prefix ? `${prefix}: ` : ""}
      {clockLabel(clock)}
    </span>
  );
}
