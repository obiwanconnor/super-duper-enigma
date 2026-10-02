import { db } from "./db";
import { loadTargets, slaFor } from "./sla/targets";
import { median, percent } from "./stats";
import { OPEN_STATUSES } from "./labels";

export type ReportFigures = {
  created: number;
  resolved: number;
  open: number;
  medianFirstResponse: number | null;
  firstResponseWithinTarget: number | null;
  medianResolution: number | null;
  resolvedWithinTarget: number | null;
  ratedGood: number | null;
  ratings: number;
};

/**
 * Service figures for one client over [since, until), overall and per product.
 * For a past period, "open" means still open at the end of the period.
 */
export async function organizationReport(organizationId: string, since: Date, until?: Date) {
  const now = new Date();
  const end = until && until < now ? until : now;
  const historical = end < now;
  const within = { gte: since, lt: end };
  const [tickets, openCounts, products, targets] = await Promise.all([
    db.ticket.findMany({
      where: { organizationId, OR: [{ createdAt: within }, { resolvedAt: within }] },
      select: {
        id: true,
        organizationId: true,
        productId: true,
        priority: true,
        status: true,
        createdAt: true,
        resolvedAt: true,
        firstRespondedAt: true,
        pausedAt: true,
        pausedBusinessMinutes: true,
        satisfaction: { select: { rating: true, updatedAt: true } },
      },
    }),
    db.ticket.groupBy({
      by: ["productId"],
      where: historical
        ? { organizationId, createdAt: { lt: end }, OR: [{ resolvedAt: null }, { resolvedAt: { gte: end } }] }
        : { organizationId, status: { in: OPEN_STATUSES } },
      _count: true,
    }),
    db.product.findMany({ where: { organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    loadTargets([organizationId]),
  ]);

  const figures = (productId?: string): ReportFigures => {
    const ts = productId ? tickets.filter((t) => t.productId === productId) : tickets;
    let frMet = 0,
      frTotal = 0,
      resMet = 0,
      resTotal = 0,
      good = 0,
      ratings = 0;
    const frTimes: number[] = [];
    const resTimes: number[] = [];
    for (const t of ts) {
      const sla = slaFor(t, targets, now);
      const inPeriod = (d: Date | null) => !!d && d >= since && d < end;
      if (inPeriod(t.createdAt) && (t.firstRespondedAt || sla.firstResponse.state === "breached")) {
        frTotal++;
        if (sla.firstResponse.state === "met") frMet++;
        if (t.firstRespondedAt) frTimes.push(sla.firstResponse.elapsedMinutes);
      }
      if (inPeriod(t.resolvedAt)) {
        resTotal++;
        if (sla.resolution.state === "met") resMet++;
        resTimes.push(sla.resolution.elapsedMinutes);
      }
      if (t.satisfaction && inPeriod(t.satisfaction.updatedAt)) {
        ratings++;
        if (t.satisfaction.rating === "GOOD") good++;
      }
    }
    return {
      created: ts.filter((t) => t.createdAt >= since && t.createdAt < end).length,
      resolved: resTotal,
      open: openCounts.filter((c) => !productId || c.productId === productId).reduce((n, c) => n + c._count, 0),
      medianFirstResponse: median(frTimes),
      firstResponseWithinTarget: percent(frMet, frTotal),
      medianResolution: median(resTimes),
      resolvedWithinTarget: percent(resMet, resTotal),
      ratedGood: percent(good, ratings),
      ratings,
    };
  };

  return { overall: figures(), products: products.map((p) => ({ ...p, figures: figures(p.id) })) };
}
