import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { isPastRetention, retentionEndsAt, RETENTION_YEARS } from "@/lib/retention";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { deleteClientData } from "../actions";

export const metadata = { title: "Data retention" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "Europe/London" });

export default async function RetentionPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  await requireAdmin();
  const flash = await searchParams;
  const orgs = await db.organization.findMany({
    where: { contractEndsAt: { not: null } },
    orderBy: { contractEndsAt: "asc" },
    include: { _count: { select: { tickets: true, users: true } } },
  });
  const due = orgs.filter((o) => isPastRetention(o.contractEndsAt));
  const upcoming = orgs.filter((o) => !isPastRetention(o.contractEndsAt));

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-2xl font-semibold">Data retention</h1>
      <p className="mb-6 text-sm text-slate-600">
        Client data is kept until {RETENTION_YEARS} years after their contract ends, then reviewed and deleted by an admin. Set contract end dates on each
        client&apos;s settings page.
      </p>
      <Flash {...flash} />

      <section aria-labelledby="due-heading" className="mb-10">
        <h2 id="due-heading" className="mb-3 text-lg font-semibold">
          Due for deletion ({due.length})
        </h2>
        {due.length === 0 ? (
          <p className="card p-5 text-sm text-slate-600">No clients are past their retention period.</p>
        ) : (
          <ul className="space-y-4">
            {due.map((o) => (
              <li key={o.id} className="card border-red-200 p-5">
                <h3 className="font-semibold">{o.name}</h3>
                <p className="mb-3 text-sm text-slate-600">
                  Contract ended {dateFmt.format(o.contractEndsAt!)}; retention ended {dateFmt.format(retentionEndsAt(o.contractEndsAt)!)}. {o._count.tickets}{" "}
                  tickets, {o._count.users} people.
                </p>
                <form action={deleteClientData} className="space-y-3">
                  <input type="hidden" name="organizationId" value={o.id} />
                  <div>
                    <label htmlFor={`confirm-${o.id}`} className="label">
                      Type <span className="font-mono">{o.name}</span> to permanently delete this client, its tickets, files and people
                    </label>
                    <input id={`confirm-${o.id}`} name="confirmName" autoComplete="off" required className="input" />
                  </div>
                  <SubmitButton className="btn-danger" pendingText="Deleting…">
                    Permanently delete {o.name}
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="upcoming-heading">
        <h2 id="upcoming-heading" className="mb-3 text-lg font-semibold">
          Contracts ended or ending
        </h2>
        {upcoming.length === 0 ? (
          <p className="card p-5 text-sm text-slate-600">No other clients have a contract end date.</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Clients with a contract end date that are still within retention</caption>
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Client
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Contract ends
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Delete after
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {upcoming.map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-2">
                      <Link href={`/admin/organizations/${o.id}`} className="link">
                        {o.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{dateFmt.format(o.contractEndsAt!)}</td>
                    <td className="px-4 py-2">{dateFmt.format(retentionEndsAt(o.contractEndsAt)!)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
