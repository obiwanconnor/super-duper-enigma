import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentViewer } from "@/lib/session";
import { loadTargets, slaFor } from "@/lib/sla/targets";
import { priorityLabels, statusLabels, typeLabels } from "@/lib/labels";
import { toCsv } from "@/lib/csv";
import { audit } from "@/lib/audit";

/** Ticket list as CSV for client admins (their own organisation only). */
export async function GET(req: Request) {
  const viewer = await currentViewer();
  if (!viewer || viewer.role !== "CLIENT" || !viewer.orgAdmin || !viewer.organizationId) {
    return new NextResponse("Not found", { status: 404 });
  }
  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get("days")) || 30, 1), 3660);
  const since = new Date(Date.now() - days * 24 * 60 * 60_000);

  const [tickets, targets, org] = await Promise.all([
    db.ticket.findMany({
      where: { organizationId: viewer.organizationId, createdAt: { gte: since } },
      orderBy: { number: "asc" },
      include: {
        product: { select: { name: true } },
        requester: { select: { name: true, email: true } },
        satisfaction: { select: { rating: true } },
      },
    }),
    loadTargets([viewer.organizationId]),
    db.organization.findUniqueOrThrow({ where: { id: viewer.organizationId }, select: { slug: true } }),
  ]);

  const rows = tickets.map((t) => {
    const sla = slaFor(t, targets);
    return [
      t.number,
      t.subject,
      t.product.name,
      typeLabels[t.type],
      priorityLabels[t.priority],
      statusLabels[t.status],
      t.requester.name ?? t.requester.email,
      t.createdAt,
      t.firstRespondedAt ?? "",
      t.resolvedAt ?? "",
      t.firstRespondedAt ? (sla.firstResponse.state === "met" ? "Yes" : "No") : "",
      t.resolvedAt ? (sla.resolution.state === "met" ? "Yes" : "No") : "",
      t.satisfaction?.rating ? t.satisfaction.rating.charAt(0) + t.satisfaction.rating.slice(1).toLowerCase() : "",
    ];
  });

  const csv = toCsv(
    ["Ticket", "Subject", "Product", "Type", "Priority", "Status", "Raised by", "Raised at", "First response at", "Resolved at", "First response within target", "Resolved within target", "Rating"],
    rows,
  );
  await audit({ actorId: viewer.id, action: "report.exported", entityType: "organization", entityId: viewer.organizationId, summary: `Downloaded ${tickets.length} tickets as CSV`, details: { days } });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${org.slug}-tickets-last-${days}-days.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
