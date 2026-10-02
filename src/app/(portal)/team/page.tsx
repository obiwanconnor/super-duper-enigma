import { db } from "@/lib/db";
import { requireClientAdmin } from "@/lib/session";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { inviteTeamMember, setTeamMemberActive } from "./actions";

export const metadata = { title: "Your team" };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const admin = await requireClientAdmin();
  const flash = await searchParams;
  const [org, people] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: admin.organizationId }, select: { name: true, emailDomains: true } }),
    db.user.findMany({
      where: { organizationId: admin.organizationId, role: "CLIENT" },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { _count: { select: { requested: true } } },
    }),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Your team</h1>
      <p className="mb-6 text-sm text-slate-600">People at {org.name} who can use the support portal.</p>
      <Flash {...flash} />

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">People in your organisation</caption>
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Name
                </th>
                <th scope="col" className="px-4 py-3">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Tickets raised
                </th>
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {people.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{p.name ?? p.email}</div>
                    {p.name && <div className="text-slate-600">{p.email}</div>}
                  </td>
                  <td className="px-4 py-3">
                    {p.active ? "Active" : "Deactivated"}
                    {p.orgAdmin && <span className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-700">Admin</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{p._count.requested}</td>
                  <td className="px-4 py-3 text-right">
                    {p.id !== admin.id && (
                      <form action={setTeamMemberActive}>
                        <input type="hidden" name="userId" value={p.id} />
                        <input type="hidden" name="active" value={String(!p.active)} />
                        <button className="btn-link" aria-label={`${p.active ? "Deactivate" : "Reactivate"} ${p.name ?? p.email}`}>
                          {p.active ? "Deactivate" : "Reactivate"}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section aria-labelledby="invite-heading" className="card h-fit p-5">
          <h2 id="invite-heading" className="mb-3 font-semibold">
            Invite a colleague
          </h2>
          <form action={inviteTeamMember} className="space-y-4">
            <div>
              <label htmlFor="team-email" className="label">
                Work email
              </label>
              <input id="team-email" name="email" type="email" required autoComplete="off" className="input" aria-describedby={org.emailDomains.length > 0 ? "team-email-hint" : undefined} />
              {org.emailDomains.length > 0 && (
                <p id="team-email-hint" className="mt-1 text-xs text-slate-600">
                  Must be an address at {org.emailDomains.join(" or ")}.
                </p>
              )}
            </div>
            <div>
              <label htmlFor="team-name" className="label">
                Name (optional)
              </label>
              <input id="team-name" name="name" autoComplete="off" className="input" />
            </div>
            <SubmitButton pendingText="Inviting…">Send invitation</SubmitButton>
          </form>
          <p className="mt-4 text-xs text-slate-600">To make someone else an admin, contact s6a support.</p>
        </section>
      </div>
    </div>
  );
}
