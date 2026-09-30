import type { TicketPriority } from "@prisma/client";
import { db } from "../db";
import { computeSla, targetsFor, type SlaTicket } from "./sla";

type OrgTargets = { priority: TicketPriority; firstResponseMinutes: number; resolutionMinutes: number }[];

/** SLA targets for several organisations at once, keyed by organisation id. */
export async function loadTargets(organizationIds: string[]): Promise<Map<string, OrgTargets>> {
  const rows = await db.slaTarget.findMany({ where: { organizationId: { in: [...new Set(organizationIds)] } } });
  const map = new Map<string, OrgTargets>();
  for (const r of rows) {
    const list = map.get(r.organizationId) ?? [];
    list.push(r);
    map.set(r.organizationId, list);
  }
  return map;
}

export function slaFor(
  ticket: SlaTicket & { organizationId: string; priority: TicketPriority },
  targets: Map<string, OrgTargets>,
  now = new Date(),
) {
  return computeSla(ticket, targetsFor(ticket.priority, targets.get(ticket.organizationId) ?? []), now);
}
