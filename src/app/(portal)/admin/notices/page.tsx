import Link from "next/link";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { noticeKindLabels } from "@/lib/notices";
import { Time } from "@/components/time";

export const metadata = { title: "Service notices" };

export default async function NoticesAdminPage() {
  await requireStaff();
  const notices = await db.serviceNotice.findMany({
    orderBy: [{ status: "asc" }, { startsAt: "desc" }],
    take: 100,
    include: { products: { select: { name: true, organization: { select: { name: true } } } }, _count: { select: { tickets: true } } },
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Service notices</h1>
        <Link href="/admin/notices/new" className="btn-primary">
          New notice
        </Link>
      </div>
      {notices.length === 0 ? (
        <p className="card p-8 text-center text-sm text-slate-600">No notices yet.</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Incidents and planned maintenance, active first</caption>
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-3">Notice</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">Starts</th>
                <th scope="col" className="px-4 py-3 text-right">Linked tickets</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {notices.map((n) => (
                <tr key={n.id}>
                  <td className="px-4 py-2">
                    <Link href={`/admin/notices/${n.id}`} className="font-medium link">
                      {n.title}
                    </Link>
                    <div className="text-xs text-slate-600">
                      {noticeKindLabels[n.kind]} · {n.products.map((p) => `${p.organization.name} – ${p.name}`).join(", ")}
                    </div>
                  </td>
                  <td className="px-4 py-2">{n.status === "ACTIVE" ? "Active" : "Resolved"}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <Time date={n.startsAt} />
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{n._count.tickets}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
