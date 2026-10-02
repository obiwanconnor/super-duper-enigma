import Link from "next/link";
import { db } from "@/lib/db";
import type { Viewer } from "@/lib/access";
import { bannerNoticeScope, noticeKindLabels } from "@/lib/notices";
import { formatDateTime } from "./time";

/** Ongoing incidents and upcoming maintenance affecting the viewer's products. */
export async function NoticeBanner({ viewer }: { viewer: Viewer }) {
  const now = new Date();
  const notices = await db.serviceNotice.findMany({
    where: bannerNoticeScope(viewer, now),
    orderBy: [{ kind: "asc" }, { startsAt: "asc" }],
    take: 5,
    select: { id: true, kind: true, title: true, startsAt: true },
  });
  if (notices.length === 0) return null;

  return (
    <section aria-label="Service notices" className="border-b border-amber-300 bg-amber-50">
      <ul className="mx-auto max-w-6xl space-y-1 px-4 py-3 text-sm text-amber-950">
        {notices.map((n) => {
          const upcoming = n.startsAt > now;
          return (
            <li key={n.id} className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-semibold">
                <span aria-hidden="true">{n.kind === "INCIDENT" ? "⚠ " : "🛠 "}</span>
                {n.kind === "INCIDENT" ? noticeKindLabels.INCIDENT : upcoming ? "Upcoming maintenance" : "Maintenance in progress"}:
              </span>
              <span>
                {n.title}
                {upcoming ? ` (from ${formatDateTime(n.startsAt)})` : ""}
              </span>
              <Link href={`/notices/${n.id}`} className="link" aria-label={`Details: ${n.title}`}>
                Details
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
