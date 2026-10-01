import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { inviteStaffUser, setStaffRole, setUserActive } from "../actions";

export const metadata = { title: "Staff" };

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const admin = await requireAdmin();
  const flash = await searchParams;
  const staff = await db.user.findMany({
    where: { role: { in: ["AGENT", "ADMIN"] } },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { _count: { select: { assigned: { where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_ON_CLIENT"] } } } } } },
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Staff</h1>
      <Flash {...flash} />
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-3">Name</th>
                <th scope="col" className="px-4 py-3">Role</th>
                <th scope="col" className="px-4 py-3 text-right">Open assigned</th>
                <th scope="col" className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staff.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3">
                    <Link href={`/admin/users/${u.id}`} className="font-medium link">
                      {u.name ?? u.email}
                    </Link>
                    {!u.active && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">Inactive</span>}
                    {u.name && <div className="text-slate-600">{u.email}</div>}
                  </td>
                  <td className="px-4 py-3">
                    {u.id === admin.id ? (
                      u.role === "ADMIN" ? "Admin" : "Agent"
                    ) : (
                      <form action={setStaffRole} className="flex items-center gap-2">
                        <input type="hidden" name="userId" value={u.id} />
                        <select name="role" defaultValue={u.role} className="input w-auto py-1" aria-label={`Role for ${u.name ?? u.email}`}>
                          <option value="AGENT">Agent</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                        <button className="btn-link" aria-label={`Save role for ${u.name ?? u.email}`}>
                          Save
                        </button>
                      </form>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">{u._count.assigned}</td>
                  <td className="px-4 py-3 text-right">
                    {u.id !== admin.id && (
                      <form action={setUserActive}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="active" value={String(!u.active)} />
                        <input type="hidden" name="returnTo" value="/admin/staff" />
                        <button className="btn-link" aria-label={`${u.active ? "Deactivate" : "Reactivate"} ${u.name ?? u.email}`}>
                          {u.active ? "Deactivate" : "Reactivate"}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form action={inviteStaffUser} className="card h-fit space-y-4 p-5">
          <h2 className="font-semibold">Invite a colleague</h2>
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input id="email" name="email" type="email" required className="input" />
          </div>
          <div>
            <label className="label" htmlFor="name">
              Name
            </label>
            <input id="name" name="name" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="role">
              Role
            </label>
            <select id="role" name="role" defaultValue="AGENT" className="input">
              <option value="AGENT">Agent — works tickets and articles</option>
              <option value="ADMIN">Admin — also manages clients and staff</option>
            </select>
          </div>
          <SubmitButton className="btn-primary w-full">Invite</SubmitButton>
        </form>
      </div>
    </div>
  );
}
