import type { NoticeKind, Prisma } from "@prisma/client";
import { db } from "./db";
import { appUrl } from "./config";
import { isStaff, type Viewer } from "./access";
import { sendEmail } from "./email/send";
import { renderEmail } from "./email/templates";
import { londonTime } from "./sla/business-time";

export const noticeKindLabels: Record<NoticeKind, string> = { INCIDENT: "Incident", MAINTENANCE: "Planned maintenance" };

/** Planned maintenance shows from this long before it starts. */
const UPCOMING_DAYS = 7;

/** Notices to show in the banner for this viewer: active ones affecting their products. */
export function bannerNoticeScope(v: Viewer, now = new Date()): Prisma.ServiceNoticeWhereInput {
  const upcoming = new Date(now.getTime() + UPCOMING_DAYS * 24 * 60 * 60_000);
  return {
    status: "ACTIVE",
    startsAt: { lte: upcoming },
    ...(isStaff(v) ? {} : { products: { some: { organizationId: v.organizationId ?? "__none__" } } }),
  };
}

/** Notices this viewer may open (any status). */
export function noticeScope(v: Viewer): Prisma.ServiceNoticeWhereInput {
  return isStaff(v) ? {} : { products: { some: { organizationId: v.organizationId ?? "__none__" } } };
}

/** Parses an <input type="datetime-local"> value as UK time. */
export function parseLondonDateTime(value: string): Date | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  return londonTime(+m[1], +m[2], +m[3], +m[4] * 60 + +m[5]);
}

/** Formats a Date for an <input type="datetime-local"> in UK time. */
export function toLondonInput(date: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/London" });

/** Emails every active client user at organisations whose products are affected. */
export async function emailNotice(noticeId: string, event: "published" | "updated" | "resolved") {
  const notice = await db.serviceNotice.findUnique({
    where: { id: noticeId },
    include: { products: { select: { name: true, organizationId: true } } },
  });
  if (!notice) return 0;

  const orgIds = [...new Set(notice.products.map((p) => p.organizationId))];
  const people = await db.user.findMany({ where: { organizationId: { in: orgIds }, role: "CLIENT", active: true }, select: { email: true, organizationId: true } });

  const kind = noticeKindLabels[notice.kind];
  const prefix = event === "resolved" ? "Resolved" : event === "updated" ? "Update" : kind;
  const heading =
    event === "resolved"
      ? `${notice.kind === "MAINTENANCE" ? "Maintenance complete" : "Resolved"}: ${notice.title}`
      : event === "updated"
        ? `Update: ${notice.title}`
        : `${kind}: ${notice.title}`;

  let sent = 0;
  for (const person of people) {
    const affected = notice.products.filter((p) => p.organizationId === person.organizationId).map((p) => p.name);
    const timing =
      notice.kind === "MAINTENANCE"
        ? `Scheduled: ${when.format(notice.startsAt)}${notice.endsAt ? ` to ${when.format(notice.endsAt)}` : ""} (UK time).`
        : `Started: ${when.format(notice.startsAt)} (UK time).`;
    const { text, html } = renderEmail({
      heading,
      bodyText: `Affects: ${affected.join(", ")}\n${timing}\n\n${event === "resolved" ? "This is now resolved. Thank you for your patience." : notice.body}\n\nThere's no need to raise a ticket about this; we'll keep you updated.`,
      action: { label: "View details", url: appUrl(`/notices/${notice.id}`) },
    });
    try {
      await sendEmail({ to: person.email, subject: `[${prefix}] ${notice.title}`, text, html });
      sent++;
    } catch (err) {
      console.error(`Failed to email notice ${notice.id} to ${person.email}`, err);
    }
  }
  return sent;
}
