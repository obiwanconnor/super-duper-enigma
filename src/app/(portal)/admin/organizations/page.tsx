import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { OPEN_STATUSES } from "@/lib/labels";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { createOrganization } from "../actions";

export const metadata = { title: "Clients" };

export default async function OrganizationsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  await requireAdmin();
  const flash = await searchParams;
  const orgs = await db.organization.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { users: true, products: true, tickets: { where: { status: { in: OPEN_STATUSES } } } } },
    },
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Clients</h1>
      <Flash {...flash} />

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-3">Organisation</th>
                <th scope="col" className="px-4 py-3">Domains</th>
                <th scope="col" className="px-4 py-3 text-right">Users</th>
                <th scope="col" className="px-4 py-3 text-right">Products</th>
                <th scope="col" className="px-4 py-3 text-right">Open tickets</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orgs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-600">
                    No clients yet.
                  </td>
                </tr>
              )}
              {orgs.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/organizations/${o.id}`} className="font-medium hover:text-brand-700">
                      {o.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{o.emailDomains.join(", ") || "—"}</td>
                  <td className="px-4 py-3 text-right">{o._count.users}</td>
                  <td className="px-4 py-3 text-right">{o._count.products}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/tickets?org=${o.id}`} className="link">
                      {o._count.tickets}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form action={createOrganization} className="card h-fit space-y-4 p-5">
          <h2 className="font-semibold">Add a client</h2>
          <div>
            <label className="label" htmlFor="name">
              Organisation name
            </label>
            <input id="name" name="name" required className="input" />
          </div>
          <div>
            <label className="label" htmlFor="emailDomains">
              Email domains
            </label>
            <input id="emailDomains" name="emailDomains" placeholder="acme.com, acme.co.uk" className="input" />
          </div>
          <SubmitButton className="btn-primary w-full">Create</SubmitButton>
        </form>
      </div>
    </div>
  );
}
