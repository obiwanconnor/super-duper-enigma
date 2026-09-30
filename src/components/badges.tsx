import type { TicketPriority, TicketStatus } from "@prisma/client";
import { priorityLabels, staffStatusLabels, statusLabels } from "@/lib/labels";

const statusStyles: Record<TicketStatus, string> = {
  OPEN: "bg-blue-50 text-blue-700 ring-blue-200",
  IN_PROGRESS: "bg-violet-50 text-violet-700 ring-violet-200",
  WAITING_ON_CLIENT: "bg-amber-50 text-amber-800 ring-amber-200",
  RESOLVED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  CLOSED: "bg-slate-100 text-slate-600 ring-slate-200",
};

const priorityStyles: Record<TicketPriority, string> = {
  LOW: "bg-slate-50 text-slate-600 ring-slate-200",
  NORMAL: "bg-slate-50 text-slate-700 ring-slate-200",
  HIGH: "bg-orange-50 text-orange-700 ring-orange-200",
  URGENT: "bg-red-50 text-red-700 ring-red-200",
};

const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap";

export function StatusBadge({ status, staff = false }: { status: TicketStatus; staff?: boolean }) {
  return <span className={`${base} ${statusStyles[status]}`}>{(staff ? staffStatusLabels : statusLabels)[status]}</span>;
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return <span className={`${base} ${priorityStyles[priority]}`}>{priorityLabels[priority]}</span>;
}
