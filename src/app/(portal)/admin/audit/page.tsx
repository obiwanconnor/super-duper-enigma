import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { Time } from "@/components/time";

export const metadata = { title: "Audit log" };

const PAGE_SIZE = 50;
const TYPES = { "": "All changes", ticket: "Tickets", organization: "Clients", user: "People", article: "Articles", canned_response: "Saved replies", notice: "Service notices", retention: "Retention" } as const;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ type?: string; page?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const type = sp.type && sp.type in TYPES ? sp.type : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.AuditEventWhereInput = type ? { entityType: type } : {};

  const [events, total] = await Promise.all([
    db.auditEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { actor: { select: { name: true, email: true } } },
    }),
    db.auditEvent.count({ where }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Audit log</h1>
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="type" className="label">
            Show
          </label>
          <select id="type" name="type" defaultValue={type} className="input w-auto">
            {Object.entries(TYPES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-secondary">Filter</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Changes made in the portal, newest first</caption>
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th scope="col" className="px-4 py-3">
                When
              </th>
              <th scope="col" className="px-4 py-3">
                Who
              </th>
              <th scope="col" className="px-4 py-3">
                What
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {events.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-600">
                  Nothing recorded yet.
                </td>
              </tr>
            )}
            {events.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-2 whitespace-nowrap text-slate-600">
                  <Time date={e.createdAt} />
                </td>
                <td className="px-4 py-2">{e.actor ? (e.actor.name ?? e.actor.email) : "System"}</td>
                <td className="px-4 py-2">
                  {e.summary}
                  {e.entityType === "ticket" && <EventLink type="ticket" id={e.entityId} />}
                  {e.entityType === "user" && <EventLink type="user" id={e.entityId} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <nav aria-label="Audit log pages" className="mt-4 flex items-center justify-between text-sm text-slate-600">
        <span>
          {total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
        </span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link href={`?type=${type}&page=${page - 1}`} className="btn-secondary">
              Previous
            </Link>
          )}
          {page * PAGE_SIZE < total && (
            <Link href={`?type=${type}&page=${page + 1}`} className="btn-secondary">
              Next
            </Link>
          )}
        </div>
      </nav>
    </div>
  );
}

async function EventLink({ type, id }: { type: "ticket" | "user"; id: string }) {
  if (type === "user") {
    return (
      <>
        {" "}
        <Link href={`/admin/users/${id}`} className="link">
          View person
        </Link>
      </>
    );
  }
  const ticket = await db.ticket.findUnique({ where: { id }, select: { number: true } });
  if (!ticket) return null;
  return (
    <>
      {" "}
      <Link href={`/tickets/${ticket.number}`} className="link">
        View ticket #{ticket.number}
      </Link>
    </>
  );
}
