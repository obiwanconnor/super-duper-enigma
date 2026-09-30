import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isStaff, productScope, ticketScope } from "@/lib/access";
import { requireViewer } from "@/lib/session";
import { OPEN_STATUSES } from "@/lib/labels";
import { PriorityBadge, StatusBadge } from "@/components/badges";
import { Time } from "@/components/time";
import { SlaBadge } from "@/components/sla";
import { loadTargets, slaFor } from "@/lib/sla/targets";

export const metadata = { title: "Tickets" };

const PAGE_SIZE = 50;

type Search = { view?: string; q?: string; org?: string; product?: string; assignee?: string; page?: string };

export default async function TicketsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const viewer = await requireViewer();
  const staff = isStaff(viewer);
  const sp = await searchParams;
  const view = sp.view ?? "open";
  const page = Math.max(1, Number(sp.page) || 1);

  const filters: Prisma.TicketWhereInput[] = [ticketScope(viewer)];
  if (view === "open") filters.push({ status: { in: OPEN_STATUSES } });
  if (view === "closed") filters.push({ status: { notIn: OPEN_STATUSES } });
  if (view === "mine") filters.push(staff ? { assigneeId: viewer.id } : { requesterId: viewer.id });
  if (sp.product) filters.push({ productId: sp.product });
  if (staff && sp.org) filters.push({ organizationId: sp.org });
  if (staff && sp.assignee === "unassigned") filters.push({ assigneeId: null });
  if (sp.q?.trim()) {
    const q = sp.q.trim();
    const n = Number(q.replace(/^#/, ""));
    filters.push({
      OR: [
        { subject: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        ...(Number.isInteger(n) && n > 0 ? [{ number: n }] : []),
      ],
    });
  }
  const where: Prisma.TicketWhereInput = { AND: filters };

  const [tickets, total, products, orgs] = await Promise.all([
    db.ticket.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        product: { select: { name: true } },
        organization: { select: { name: true } },
        requester: { select: { name: true, email: true } },
        assignee: { select: { name: true, email: true } },
      },
    }),
    db.ticket.count({ where }),
    db.product.findMany({ where: productScope(viewer), orderBy: { name: "asc" }, select: { id: true, name: true, organization: { select: { name: true } } } }),
    staff ? db.organization.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);

  const targets = staff ? await loadTargets(tickets.map((t) => t.organizationId)) : new Map();
  const now = new Date();

  const views = [
    { key: "open", label: "Open" },
    { key: "mine", label: staff ? "Assigned to me" : "Raised by me" },
    { key: "closed", label: "Resolved & closed" },
    { key: "all", label: "All" },
  ];

  const qs = (overrides: Partial<Search>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...overrides })) if (v) params.set(k, String(v));
    return `?${params.toString()}`;
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Tickets</h1>
        {products.length > 0 && (
          <Link href="/tickets/new" className="btn-primary">
            New ticket
          </Link>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
        {views.map((v) => (
          <Link
            key={v.key}
            href={qs({ view: v.key, page: undefined })}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              view === v.key ? "border-brand-600 font-medium text-brand-700" : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            {v.label}
          </Link>
        ))}
      </div>

      <form className="mb-4 flex flex-wrap gap-2" method="get">
        <input type="hidden" name="view" value={view} />
        <input name="q" defaultValue={sp.q} placeholder="Search subject, description or #number" className="input max-w-xs" />
        <select name="product" defaultValue={sp.product ?? ""} className="input w-auto">
          <option value="">All products</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {staff ? `${p.organization.name} – ${p.name}` : p.name}
            </option>
          ))}
        </select>
        {staff && (
          <>
            <select name="org" defaultValue={sp.org ?? ""} className="input w-auto">
              <option value="">All clients</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <select name="assignee" defaultValue={sp.assignee ?? ""} className="input w-auto">
              <option value="">Anyone</option>
              <option value="unassigned">Unassigned</option>
            </select>
          </>
        )}
        <button className="btn-secondary">Filter</button>
      </form>

      {tickets.length === 0 ? (
        <div className="card p-10 text-center text-sm text-slate-500">
          {products.length === 0 && !staff
            ? "Your organisation doesn't have any products set up yet. Please contact your account manager."
            : "No tickets match these filters."}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Priority</th>
                {staff && <th className="px-4 py-3">SLA</th>}
                {staff && <th className="px-4 py-3">Assignee</th>}
                <th className="px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tickets.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-500">{t.number}</td>
                  <td className="px-4 py-3">
                    <Link href={`/tickets/${t.number}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {t.subject}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {staff ? `${t.organization.name} · ` : ""}
                      {t.product.name} · {t.requester.name ?? t.requester.email}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={t.status} staff={staff} />
                  </td>
                  <td className="px-4 py-3">
                    <PriorityBadge priority={t.priority} />
                  </td>
                  {staff && (
                    <td className="px-4 py-3">
                      <SlaCell sla={slaFor(t, targets, now)} />
                    </td>
                  )}
                  {staff && <td className="px-4 py-3 text-slate-600">{t.assignee ? (t.assignee.name ?? t.assignee.email) : "—"}</td>}
                  <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                    <Time date={t.updatedAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
          <span>
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={qs({ page: String(page - 1) })} className="btn-secondary">
                Previous
              </Link>
            )}
            {page * PAGE_SIZE < total && (
              <Link href={qs({ page: String(page + 1) })} className="btn-secondary">
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Shows whichever clock matters now: first response until answered, then resolution. */
function SlaCell({ sla }: { sla: ReturnType<typeof slaFor> }) {
  // The first-response clock only has a due date while it is still waiting for a reply.
  if (sla.firstResponse.dueAt) return <SlaBadge clock={sla.firstResponse} prefix="Reply" />;
  return <SlaBadge clock={sla.resolution} prefix="Fix" />;
}
