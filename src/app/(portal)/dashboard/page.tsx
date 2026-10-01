import Link from "next/link";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { isAdmin } from "@/lib/access";
import { isPastRetention } from "@/lib/retention";
import { OPEN_STATUSES } from "@/lib/labels";
import { loadTargets, slaFor } from "@/lib/sla/targets";
import { formatBusinessDuration } from "@/lib/sla/business-time";
import { lastMonths, median, percent } from "@/lib/stats";
import { PriorityBadge } from "@/components/badges";
import { SlaBadge } from "@/components/sla";

export const metadata = { title: "Dashboard" };

const slaFields = {
  id: true,
  number: true,
  subject: true,
  organizationId: true,
  priority: true,
  status: true,
  createdAt: true,
  resolvedAt: true,
  firstRespondedAt: true,
  pausedAt: true,
  pausedBusinessMinutes: true,
  assigneeId: true,
} as const;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const viewer = await requireStaff();
  const days = (await searchParams).days === "90" ? 90 : 30;
  const now = new Date();
  const since = new Date(now.getTime() - days * 24 * 60 * 60_000);
  const months = lastMonths(6, now);
  const monthsStart = new Date(`${months[0]}-01T00:00:00Z`);

  const [orgs, openTickets, pendingDrafts, recent, created, resolved, ratings] = await Promise.all([
    db.organization.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, contractEndsAt: true } }),
    db.ticket.findMany({ where: { status: { in: OPEN_STATUSES } }, select: { ...slaFields, organization: { select: { name: true } } } }),
    db.aiDraft.count({ where: { status: "PENDING", ticket: { status: { in: OPEN_STATUSES } } } }),
    // Tickets whose response or resolution happened within the period.
    db.ticket.findMany({
      where: { OR: [{ createdAt: { gte: since } }, { resolvedAt: { gte: since } }] },
      select: slaFields,
    }),
    db.$queryRaw<{ org: string; month: string; n: bigint }[]>`
      SELECT "organizationId" AS org, to_char(date_trunc('month', "createdAt" AT TIME ZONE 'Europe/London'), 'YYYY-MM') AS month, count(*) AS n
      FROM "Ticket" WHERE "createdAt" >= ${monthsStart} GROUP BY 1, 2`,
    db.$queryRaw<{ org: string; month: string; n: bigint }[]>`
      SELECT "organizationId" AS org, to_char(date_trunc('month', "resolvedAt" AT TIME ZONE 'Europe/London'), 'YYYY-MM') AS month, count(*) AS n
      FROM "Ticket" WHERE "resolvedAt" >= ${monthsStart} GROUP BY 1, 2`,
    db.satisfactionResponse.findMany({
      where: { updatedAt: { gte: since } },
      select: { rating: true, ticket: { select: { organizationId: true } } },
    }),
  ]);
  const retentionDue = isAdmin(viewer) ? orgs.filter((o) => isPastRetention(o.contractEndsAt)) : [];

  // ---- Satisfaction ---------------------------------------------------------
  const csat = new Map<string, { good: number; total: number }>();
  const csatAll = { good: 0, okay: 0, poor: 0, total: 0 };
  for (const r of ratings) {
    const c = csat.get(r.ticket.organizationId) ?? { good: 0, total: 0 };
    c.total++;
    if (r.rating === "GOOD") c.good++;
    csat.set(r.ticket.organizationId, c);
    csatAll.total++;
    if (r.rating === "GOOD") csatAll.good++;
    if (r.rating === "OKAY") csatAll.okay++;
    if (r.rating === "POOR") csatAll.poor++;
  }

  const targets = await loadTargets(orgs.map((o) => o.id));

  // ---- Queue health ---------------------------------------------------------
  const open = openTickets.map((t) => ({ ...t, sla: slaFor(t, targets, now) }));
  const replyOverdue = open.filter((t) => t.sla.firstResponse.dueAt && t.sla.firstResponse.state === "breached");
  const fixOverdue = open.filter((t) => t.sla.resolution.state === "breached");
  const atRisk = open.filter((t) => t.sla.firstResponse.state === "at_risk" || t.sla.resolution.state === "at_risk");

  const attention = open
    .map((t) => {
      const clock = t.sla.firstResponse.dueAt ? t.sla.firstResponse : t.sla.resolution;
      return { ...t, clock, label: t.sla.firstResponse.dueAt ? "Reply" : "Fix" };
    })
    .filter((t) => t.clock.state === "breached" || t.clock.state === "at_risk")
    .sort((a, b) => a.clock.remainingMinutes - b.clock.remainingMinutes)
    .slice(0, 10);

  // ---- Response times (period) ---------------------------------------------
  type Agg = { frTimes: number[]; frMet: number; frTotal: number; resTimes: number[]; resMet: number; resTotal: number };
  const empty = (): Agg => ({ frTimes: [], frMet: 0, frTotal: 0, resTimes: [], resMet: 0, resTotal: 0 });
  const byOrg = new Map<string, Agg>();
  const overall = empty();
  for (const t of recent) {
    const sla = slaFor(t, targets, now);
    const aggs = [overall, byOrg.get(t.organizationId) ?? byOrg.set(t.organizationId, empty()).get(t.organizationId)!];
    for (const a of aggs) {
      // First response: counted once it has been answered, or has already breached.
      if (t.createdAt >= since && (t.firstRespondedAt || sla.firstResponse.state === "breached")) {
        a.frTotal++;
        if (sla.firstResponse.state === "met") a.frMet++;
        if (t.firstRespondedAt) a.frTimes.push(sla.firstResponse.elapsedMinutes);
      }
      if (t.resolvedAt && t.resolvedAt >= since) {
        a.resTotal++;
        if (sla.resolution.state === "met") a.resMet++;
        a.resTimes.push(sla.resolution.elapsedMinutes);
      }
    }
  }

  // ---- Volumes --------------------------------------------------------------
  const volume = new Map<string, { created: number; resolved: number }>();
  const key = (org: string, month: string) => `${org}|${month}`;
  for (const r of created) volume.set(key(r.org, r.month), { created: Number(r.n), resolved: volume.get(key(r.org, r.month))?.resolved ?? 0 });
  for (const r of resolved) volume.set(key(r.org, r.month), { created: volume.get(key(r.org, r.month))?.created ?? 0, resolved: Number(r.n) });
  const monthLabel = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="flex gap-1 text-sm">
          {[30, 90].map((d) => (
            <Link key={d} href={`?days=${d}`} className={`rounded-md px-3 py-1.5 ${days === d ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              Last {d} days
            </Link>
          ))}
        </div>
      </div>

      {retentionDue.length > 0 && (
        <p role="status" className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <span aria-hidden="true">! </span>
          {retentionDue.length} {retentionDue.length === 1 ? "client is" : "clients are"} past the data retention period.{" "}
          <Link href="/admin/retention" className="link">
            Review data retention
          </Link>
        </p>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">Queue health</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Tile label="Open" value={open.length} href="/tickets?view=open" />
          <Tile label="Unassigned" value={open.filter((t) => !t.assigneeId).length} href="/tickets?view=open&assignee=unassigned" />
          <Tile label="Waiting on client" value={open.filter((t) => t.status === "WAITING_ON_CLIENT").length} />
          <Tile label="AI drafts to review" value={pendingDrafts} />
          <Tile label="Reply overdue" value={replyOverdue.length} status={replyOverdue.length ? "critical" : "good"} />
          <Tile label="Fix overdue" value={fixOverdue.length} status={fixOverdue.length ? "critical" : "good"} sub={atRisk.length ? `${atRisk.length} at risk` : undefined} />
        </div>

        <div className="card mt-4 overflow-x-auto">
          <h3 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">Needs attention</h3>
          {attention.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-600">Nothing breached or at risk.</p>
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">Tickets breached or at risk, most urgent first</caption>
              <thead className="sr-only">
                <tr>
                  <th scope="col">Number</th>
                  <th scope="col">Ticket</th>
                  <th scope="col">Priority</th>
                  <th scope="col">SLA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {attention.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-2 text-slate-600">#{t.number}</td>
                    <td className="px-4 py-2">
                      <Link href={`/tickets/${t.number}`} className="font-medium hover:text-brand-700">
                        {t.subject}
                      </Link>
                      <div className="text-xs text-slate-600">{t.organization.name}</div>
                    </td>
                    <td className="px-4 py-2">
                      <PriorityBadge priority={t.priority} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <SlaBadge clock={t.clock} prefix={t.label} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">Response times · last {days} days</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Tile label="Median first response" value={fmt(median(overall.frTimes))} sub="business hours" />
          <Tile label="First response within SLA" value={pct(percent(overall.frMet, overall.frTotal))} sub={`${overall.frTotal} tickets`} />
          <Tile label="Median resolution" value={fmt(median(overall.resTimes))} sub="business hours, excl. paused" />
          <Tile label="Resolved within SLA" value={pct(percent(overall.resMet, overall.resTotal))} sub={`${overall.resTotal} tickets`} />
          <Tile
            label="Rated good"
            value={pct(percent(csatAll.good, csatAll.total))}
            sub={csatAll.total ? `${csatAll.good} good · ${csatAll.okay} okay · ${csatAll.poor} poor` : "No ratings yet"}
          />
        </div>
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-3">Client</th>
                <th scope="col" className="px-4 py-3 text-right">Median first response</th>
                <th scope="col" className="px-4 py-3 text-right">Within SLA</th>
                <th scope="col" className="px-4 py-3 text-right">Median resolution</th>
                <th scope="col" className="px-4 py-3 text-right">Within SLA</th>
                <th scope="col" className="px-4 py-3 text-right">Rated good</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orgs.map((o) => {
                const a = byOrg.get(o.id) ?? empty();
                const c = csat.get(o.id);
                return (
                  <tr key={o.id}>
                    <td className="px-4 py-2 font-medium">{o.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmt(median(a.frTimes))}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      <Compliance value={percent(a.frMet, a.frTotal)} n={a.frTotal} />
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmt(median(a.resTimes))}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      <Compliance value={percent(a.resMet, a.resTotal)} n={a.resTotal} />
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{c ? `${percent(c.good, c.total)}% (${c.total})` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">Volumes by client · created / resolved per month</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-3">Client</th>
                {months.map((m) => (
                  <th key={m} scope="col" className="px-4 py-3 text-right">
                    {monthLabel(m)}
                  </th>
                ))}
                <th scope="col" className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orgs.map((o) => {
                const cells = months.map((m) => volume.get(key(o.id, m)) ?? { created: 0, resolved: 0 });
                const total = cells.reduce((s, c) => ({ created: s.created + c.created, resolved: s.resolved + c.resolved }), { created: 0, resolved: 0 });
                return (
                  <tr key={o.id}>
                    <td className="px-4 py-2 font-medium">
                      <Link href={`/tickets?org=${o.id}&view=all`} className="hover:text-brand-700">
                        {o.name}
                      </Link>
                    </td>
                    {cells.map((c, i) => (
                      <td key={months[i]} className="px-4 py-2 text-right tabular-nums">
                        <VolumeCell {...c} />
                      </td>
                    ))}
                    <td className="px-4 py-2 text-right font-medium tabular-nums">
                      <VolumeCell {...total} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const fmt = (m: number | null) => (m === null ? "—" : formatBusinessDuration(m));
const pct = (p: number | null) => (p === null ? "—" : `${p}%`);

const statusStyle = {
  good: { icon: "✓", className: "text-emerald-700", label: "On track" },
  critical: { icon: "!", className: "text-red-700", label: "Needs action" },
} as const;

function Tile({ label, value, sub, href, status }: { label: string; value: number | string; sub?: string; href?: string; status?: keyof typeof statusStyle }) {
  const s = status ? statusStyle[status] : null;
  const body = (
    <div className="card h-full p-4">
      <div className="text-xs font-medium text-slate-600">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">{value}</div>
      <div className="mt-1 flex flex-wrap gap-x-2 text-xs">
        {s && (
          <span className={`font-medium ${s.className}`}>
            <span aria-hidden>{s.icon}</span> {s.label}
          </span>
        )}
        {sub && <span className="text-slate-600">{sub}</span>}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block hover:opacity-90">
      {body}
    </Link>
  ) : (
    body
  );
}

function Compliance({ value, n }: { value: number | null; n: number }) {
  if (value === null) return <span className="text-slate-600">—</span>;
  const low = value < 90;
  return (
    <span className={low ? "font-medium text-red-700" : "text-slate-800"} title={`${n} tickets`}>
      {low && <span aria-hidden>! </span>}
      {value}%
    </span>
  );
}

function VolumeCell({ created, resolved }: { created: number; resolved: number }) {
  if (!created && !resolved)
    return (
      <span className="text-slate-600">
        <span aria-hidden="true">·</span>
        <span className="sr-only">none</span>
      </span>
    );
  return (
    <span>
      <span aria-hidden="true">
        {created}
        <span className="text-slate-600"> / {resolved}</span>
      </span>
      <span className="sr-only">
        {created} created, {resolved} resolved
      </span>
    </span>
  );
}
