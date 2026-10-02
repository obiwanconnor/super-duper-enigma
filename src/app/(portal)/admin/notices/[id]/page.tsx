import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { noticeKindLabels } from "@/lib/notices";
import { Flash } from "@/components/flash";
import { NoticeForm } from "@/components/notice-form";
import { SubmitButton } from "@/components/submit-button";
import { resolveNotice, updateNotice } from "../actions";

export const metadata = { title: "Service notice" };

export default async function NoticeAdminPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  await requireStaff();
  const flash = await searchParams;
  const notice = await db.serviceNotice.findUnique({
    where: { id: (await params).id },
    include: {
      products: { select: { name: true, organization: { select: { name: true } } } },
      tickets: { select: { number: true, subject: true, organization: { select: { name: true } } }, orderBy: { number: "asc" } },
    },
  });
  if (!notice) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/notices" className="text-sm link">
        <span aria-hidden="true">← </span>Service notices
      </Link>
      <h1 className="mt-2 mb-1 text-2xl font-semibold">{notice.title}</h1>
      <p className="mb-6 text-sm text-slate-600">
        {noticeKindLabels[notice.kind]} · {notice.status === "ACTIVE" ? "Active" : "Resolved"} · affects{" "}
        {notice.products.map((p) => `${p.organization.name} – ${p.name}`).join(", ")}
      </p>
      <Flash {...flash} />

      <NoticeForm action={updateNotice} notice={notice} />

      {notice.status === "ACTIVE" && (
        <section aria-labelledby="resolve-heading" className="card mt-6 p-5">
          <h2 id="resolve-heading" className="mb-2 font-semibold">
            Resolve
          </h2>
          <form action={resolveNotice} className="space-y-3">
            <input type="hidden" name="id" value={notice.id} />
            <label className="flex min-h-6 items-center gap-2 text-sm">
              <input type="checkbox" name="email" defaultChecked /> Email affected clients that it&apos;s resolved
            </label>
            <SubmitButton className="btn-primary" pendingText="Resolving…">
              Mark as resolved
            </SubmitButton>
          </form>
        </section>
      )}

      <section aria-labelledby="linked-heading" className="mt-6">
        <h2 id="linked-heading" className="mb-2 font-semibold">
          Linked tickets ({notice.tickets.length})
        </h2>
        {notice.tickets.length === 0 ? (
          <p className="text-sm text-slate-600">No tickets linked yet. Link duplicate reports from each ticket&apos;s page.</p>
        ) : (
          <ul className="card divide-y divide-slate-100 text-sm">
            {notice.tickets.map((t) => (
              <li key={t.number} className="px-5 py-2">
                <Link href={`/tickets/${t.number}`} className="link">
                  #{t.number} {t.subject}
                </Link>{" "}
                <span className="text-slate-600">· {t.organization.name}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
