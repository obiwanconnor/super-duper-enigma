import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireViewer } from "@/lib/session";
import { isStaff } from "@/lib/access";
import { noticeKindLabels, noticeScope } from "@/lib/notices";
import { Markdown } from "@/components/markdown";
import { Time } from "@/components/time";

export const metadata = { title: "Service notice" };

export default async function NoticePage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  const notice = await db.serviceNotice.findFirst({
    where: { AND: [{ id: (await params).id }, noticeScope(viewer)] },
    include: {
      products: {
        where: isStaff(viewer) ? {} : { organizationId: viewer.organizationId ?? "__none__" },
        select: { name: true },
      },
    },
  });
  if (!notice) notFound();

  return (
    <article className="mx-auto max-w-3xl">
      <Link href="/tickets" className="text-sm link">
        <span aria-hidden="true">← </span>Tickets
      </Link>
      <p className="mt-4 text-sm font-semibold text-slate-700">
        {noticeKindLabels[notice.kind]} · {notice.status === "ACTIVE" ? (notice.startsAt > new Date() ? "Scheduled" : "Ongoing") : "Resolved"}
      </p>
      <h1 className="mt-1 mb-4 text-2xl font-semibold">{notice.title}</h1>
      <dl className="card mb-6 grid gap-3 p-5 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-slate-600">Affects</dt>
          <dd>{notice.products.map((p) => p.name).join(", ")}</dd>
        </div>
        <div>
          <dt className="text-slate-600">{notice.kind === "MAINTENANCE" ? "Starts" : "Started"}</dt>
          <dd>
            <Time date={notice.startsAt} />
          </dd>
        </div>
        <div>
          <dt className="text-slate-600">{notice.status === "RESOLVED" ? "Resolved" : "Expected end"}</dt>
          <dd>{notice.resolvedAt ? <Time date={notice.resolvedAt} /> : notice.endsAt ? <Time date={notice.endsAt} /> : "Not yet known"}</dd>
        </div>
      </dl>
      <div className="card p-6">
        <Markdown>{notice.body}</Markdown>
      </div>
      <p className="mt-4 text-sm text-slate-600">
        Last updated <Time date={notice.updatedAt} />. There&apos;s no need to raise a ticket about this; we&apos;ll keep you updated.
      </p>
    </article>
  );
}
