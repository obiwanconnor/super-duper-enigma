import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { ERASED_NAME } from "@/lib/privacy";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { Time } from "@/components/time";
import { eraseUser, setUserActive } from "../../actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const user = await db.user.findUnique({ where: { id: (await params).id }, select: { name: true, email: true } });
  return { title: user ? `${user.name ?? user.email} – user` : "User" };
}

const roleLabels = { CLIENT: "Client user", AGENT: "Agent", ADMIN: "Admin", AI: "AI assistant" } as const;

export default async function UserPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  const flash = await searchParams;
  const user = await db.user.findUnique({
    where: { id },
    include: {
      organization: { select: { id: true, name: true } },
      _count: { select: { requested: true, comments: true, attachments: true } },
    },
  });
  if (!user || user.role === "AI") notFound();

  const erased = user.name === ERASED_NAME && user.email.endsWith("@erased.invalid");
  const back = user.organization ? { href: `/admin/organizations/${user.organization.id}`, label: user.organization.name } : { href: "/admin/staff", label: "Staff" };
  const recent = await db.auditEvent.findMany({ where: { entityType: "user", entityId: user.id }, orderBy: { createdAt: "desc" }, take: 10, include: { actor: { select: { name: true, email: true } } } });

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={back.href} className="text-sm link">
        ← {back.label}
      </Link>
      <h1 className="mt-2 mb-1 text-2xl font-semibold">{user.name ?? user.email}</h1>
      <p className="mb-6 text-sm text-slate-600">
        {roleLabels[user.role]} · {user.email} · {user.active ? "Active" : "Inactive"}
      </p>
      <Flash {...flash} />

      <dl className="card mb-6 grid grid-cols-1 gap-4 p-5 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-slate-600">Tickets raised</dt>
          <dd className="text-xl font-semibold">{user._count.requested}</dd>
        </div>
        <div>
          <dt className="text-slate-600">Replies written</dt>
          <dd className="text-xl font-semibold">{user._count.comments}</dd>
        </div>
        <div>
          <dt className="text-slate-600">Files uploaded</dt>
          <dd className="text-xl font-semibold">{user._count.attachments}</dd>
        </div>
      </dl>

      <section className="card mb-6 p-5" aria-labelledby="sar-heading">
        <h2 id="sar-heading" className="mb-1 font-semibold">
          Export personal data
        </h2>
        <p className="mb-3 text-sm text-slate-600">
          Downloads everything the portal holds about this person as JSON, for a subject access request. Internal staff notes are not included
          automatically: check them before you reply to the request.
        </p>
        <a href={`/admin/users/${user.id}/export`} className="btn-secondary" download>
          Download data export
        </a>
      </section>

      {user.id !== admin.id && !erased && (
        <section className="card mb-6 p-5" aria-labelledby="access-heading">
          <h2 id="access-heading" className="mb-3 font-semibold">
            Access
          </h2>
          <form action={setUserActive}>
            <input type="hidden" name="userId" value={user.id} />
            <input type="hidden" name="active" value={String(!user.active)} />
            <input type="hidden" name="returnTo" value={`/admin/users/${user.id}`} />
            <SubmitButton className="btn-secondary">{user.active ? "Deactivate account" : "Reactivate account"}</SubmitButton>
          </form>
        </section>
      )}

      {user.id !== admin.id && !erased && (
        <section className="card mb-6 border-red-200 p-5" aria-labelledby="erase-heading">
          <h2 id="erase-heading" className="mb-1 font-semibold">
            Erase personal data
          </h2>
          <p className="mb-3 text-sm text-slate-600">
            Replaces this person&apos;s name and email with &ldquo;{ERASED_NAME}&rdquo;, signs them out everywhere, and removes them from tickets they were copied in on. Their
            tickets and replies stay as part of the client&apos;s support history. This can&apos;t be undone.
          </p>
          <form action={eraseUser} className="space-y-3">
            <input type="hidden" name="userId" value={user.id} />
            <div>
              <label htmlFor="confirmEmail" className="label">
                Type <span className="font-mono">{user.email}</span> to confirm
              </label>
              <input id="confirmEmail" name="confirmEmail" type="email" autoComplete="off" required className="input" />
            </div>
            <SubmitButton className="btn-danger" pendingText="Erasing…">
              Erase personal data
            </SubmitButton>
          </form>
        </section>
      )}

      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className="mb-3 font-semibold">
          Account history
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-600">No recorded changes.</p>
        ) : (
          <ul className="card divide-y divide-slate-100 text-sm">
            {recent.map((e) => (
              <li key={e.id} className="px-5 py-3">
                {e.summary}
                <span className="block text-slate-600">
                  {e.actor ? (e.actor.name ?? e.actor.email) : "System"} · <Time date={e.createdAt} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
