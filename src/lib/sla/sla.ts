import type { TicketPriority, TicketStatus } from "@prisma/client";
import { addBusinessMinutes, BUSINESS_DAY_MINUTES, businessMinutesBetween } from "./business-time";

export type SlaTargets = { firstResponseMinutes: number; resolutionMinutes: number };

const HOUR = 60;
const DAY = BUSINESS_DAY_MINUTES;

/** Defaults for new clients, in business minutes. Editable per client. */
export const DEFAULT_SLA_TARGETS: Record<TicketPriority, SlaTargets> = {
  URGENT: { firstResponseMinutes: 1 * HOUR, resolutionMinutes: 1 * DAY },
  HIGH: { firstResponseMinutes: 4 * HOUR, resolutionMinutes: 3 * DAY },
  NORMAL: { firstResponseMinutes: 1 * DAY, resolutionMinutes: 5 * DAY },
  LOW: { firstResponseMinutes: 2 * DAY, resolutionMinutes: 10 * DAY },
};

export const PRIORITIES: TicketPriority[] = ["URGENT", "HIGH", "NORMAL", "LOW"];

/** Statuses in which the resolution clock does not run. */
export const PAUSED_STATUSES: TicketStatus[] = ["WAITING_ON_CLIENT", "RESOLVED", "CLOSED"];

export function targetsFor(
  priority: TicketPriority,
  orgTargets: { priority: TicketPriority; firstResponseMinutes: number; resolutionMinutes: number }[],
): SlaTargets {
  const t = orgTargets.find((x) => x.priority === priority);
  return t ? { firstResponseMinutes: t.firstResponseMinutes, resolutionMinutes: t.resolutionMinutes } : DEFAULT_SLA_TARGETS[priority];
}

/**
 * Fields to write when a ticket changes status: keeps resolvedAt and the
 * paused-time accounting consistent wherever the status is changed.
 */
export function statusChangeData(
  ticket: { status: TicketStatus; resolvedAt: Date | null; pausedAt: Date | null; pausedBusinessMinutes: number },
  status: TicketStatus,
  now = new Date(),
) {
  const wasPaused = PAUSED_STATUSES.includes(ticket.status) && ticket.pausedAt !== null;
  const willPause = PAUSED_STATUSES.includes(status);
  const resolved = status === "RESOLVED" || status === "CLOSED";

  let pausedAt = ticket.pausedAt;
  let pausedBusinessMinutes = ticket.pausedBusinessMinutes;
  if (wasPaused && !willPause) {
    pausedBusinessMinutes += businessMinutesBetween(ticket.pausedAt!, now);
    pausedAt = null;
  } else if (!wasPaused && willPause) {
    pausedAt = now;
  }

  return {
    status,
    resolvedAt: resolved ? (ticket.resolvedAt ?? now) : null,
    pausedAt,
    pausedBusinessMinutes,
  };
}

export type ClockState = "met" | "breached" | "running" | "at_risk" | "paused";

export type Clock = {
  state: ClockState;
  targetMinutes: number;
  elapsedMinutes: number;
  /** Positive while time remains, negative once overdue. */
  remainingMinutes: number;
  /** When the clock will breach, if it is running. */
  dueAt: Date | null;
};

export type SlaTicket = {
  createdAt: Date;
  status: TicketStatus;
  firstRespondedAt: Date | null;
  pausedAt: Date | null;
  pausedBusinessMinutes: number;
};

/** A clock is "at risk" once less than a quarter of its target remains. */
const AT_RISK_FRACTION = 0.25;

function runningState(remaining: number, target: number): ClockState {
  if (remaining < 0) return "breached";
  return remaining < target * AT_RISK_FRACTION ? "at_risk" : "running";
}

export function computeSla(ticket: SlaTicket, targets: SlaTargets, now = new Date()): { firstResponse: Clock; resolution: Clock } {
  // First response: from creation to the first real reply (staff or AI).
  const frEnd = ticket.firstRespondedAt ?? now;
  const frElapsed = businessMinutesBetween(ticket.createdAt, frEnd);
  const frRemaining = targets.firstResponseMinutes - frElapsed;
  const responded = !!ticket.firstRespondedAt;
  const closedWithoutReply = !responded && (ticket.status === "RESOLVED" || ticket.status === "CLOSED");
  const firstResponse: Clock = {
    state: responded || closedWithoutReply ? (frRemaining >= 0 ? "met" : "breached") : runningState(frRemaining, targets.firstResponseMinutes),
    targetMinutes: targets.firstResponseMinutes,
    elapsedMinutes: frElapsed,
    remainingMinutes: frRemaining,
    dueAt: responded || closedWithoutReply ? null : addBusinessMinutes(ticket.createdAt, targets.firstResponseMinutes),
  };

  // Resolution: business time open, minus time spent paused.
  const currentPause = ticket.pausedAt ? businessMinutesBetween(ticket.pausedAt, now) : 0;
  const resElapsed = Math.max(0, businessMinutesBetween(ticket.createdAt, now) - ticket.pausedBusinessMinutes - currentPause);
  const resRemaining = targets.resolutionMinutes - resElapsed;
  const done = ticket.status === "RESOLVED" || ticket.status === "CLOSED";
  const paused = PAUSED_STATUSES.includes(ticket.status);

  let resState: ClockState;
  if (done) resState = resRemaining >= 0 ? "met" : "breached";
  else if (resRemaining < 0) resState = "breached";
  else if (paused) resState = "paused";
  else resState = runningState(resRemaining, targets.resolutionMinutes);

  const resolution: Clock = {
    state: resState,
    targetMinutes: targets.resolutionMinutes,
    elapsedMinutes: resElapsed,
    remainingMinutes: resRemaining,
    dueAt: !done && !paused && resRemaining >= 0 ? addBusinessMinutes(now, resRemaining) : null,
  };

  return { firstResponse, resolution };
}

/** "4 business hours", "1 business day", "2.5 business days" – for clients. */
export function describeTarget(minutes: number): string {
  const day = BUSINESS_DAY_MINUTES;
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ""));
  if (minutes >= day && minutes % (day / 2) === 0) {
    const days = minutes / day;
    return `${fmt(days)} business ${days === 1 ? "day" : "days"}`;
  }
  if (minutes >= 60) {
    const hours = minutes / 60;
    return `${fmt(hours)} business ${hours === 1 ? "hour" : "hours"}`;
  }
  return `${minutes} business minutes`;
}
