import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { OPEN_STATUSES } from "@/lib/labels";
import { loadTargets, slaFor } from "@/lib/sla/targets";
import { notifySlaBreach } from "@/lib/notifications";
import { aiConfigured, runTriage } from "@/lib/ai/assistant";

/**
 * Runs every 15 minutes (vercel.json). Vercel sends
 * `Authorization: Bearer $CRON_SECRET`.
 *  - emails staff once when a ticket breaches each SLA clock
 *  - retries AI triage that failed or got stuck
 */

export const maxDuration = 300;

function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization") ?? "";
  if (!secret) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const now = new Date();
  const open = await db.ticket.findMany({
    where: {
      status: { in: OPEN_STATUSES },
      OR: [{ firstResponseBreachNotifiedAt: null }, { resolutionBreachNotifiedAt: null }],
    },
    select: {
      id: true,
      organizationId: true,
      priority: true,
      createdAt: true,
      status: true,
      firstRespondedAt: true,
      pausedAt: true,
      pausedBusinessMinutes: true,
      firstResponseBreachNotifiedAt: true,
      resolutionBreachNotifiedAt: true,
    },
  });
  const targets = await loadTargets(open.map((t) => t.organizationId));

  let alerts = 0;
  for (const t of open) {
    const sla = slaFor(t, targets, now);
    // Only alert while the clock is live; a reply that arrived late is not news.
    if (sla.firstResponse.state === "breached" && !t.firstRespondedAt && !t.firstResponseBreachNotifiedAt) {
      await db.ticket.update({ where: { id: t.id }, data: { firstResponseBreachNotifiedAt: now } });
      await notifySlaBreach(t.id, "firstResponse");
      alerts++;
    }
    if (sla.resolution.state === "breached" && !t.resolutionBreachNotifiedAt) {
      await db.ticket.update({ where: { id: t.id }, data: { resolutionBreachNotifiedAt: now } });
      await notifySlaBreach(t.id, "resolution");
      alerts++;
    }
  }

  let retried = 0;
  if (aiConfigured()) {
    // Release runs that died mid-flight (e.g. function timeout).
    await db.ticket.updateMany({
      where: { aiStatus: "RUNNING", aiUpdatedAt: { lt: new Date(now.getTime() - 10 * 60_000) } },
      data: { aiStatus: "FAILED" },
    });
    const pending = await db.ticket.findMany({
      where: {
        OR: [
          { aiStatus: "FAILED", aiAttempts: { lt: 3 } },
          { aiStatus: "PENDING", createdAt: { lt: new Date(now.getTime() - 2 * 60_000) } },
        ],
      },
      select: { id: true },
      take: 10,
    });
    for (const t of pending) {
      await runTriage(t.id);
      retried++;
    }
  }

  return NextResponse.json({ ok: true, checked: open.length, alerts, retried });
}
