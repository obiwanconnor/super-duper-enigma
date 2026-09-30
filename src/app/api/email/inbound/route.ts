import { timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canViewTicket } from "@/lib/access";
import { parseReplyAddress } from "@/lib/email/reply-token";
import { extractEmailAddress, extractReplyText } from "@/lib/email/parse-reply";
import { addComment } from "@/lib/tickets";
import { notifyCommentAdded } from "@/lib/notifications";

/**
 * SendGrid Inbound Parse webhook. Configure the destination URL as
 *   https://<host>/api/email/inbound?secret=<INBOUND_EMAIL_SECRET>
 * SendGrid posts multipart/form-data with fields including to, from, subject,
 * text and html.
 *
 * We always answer 200 for messages we choose to ignore, otherwise SendGrid
 * retries them for days.
 */

function secretMatches(given: string | null): boolean {
  const expected = process.env.INBOUND_EMAIL_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export async function POST(req: Request) {
  if (!secretMatches(new URL(req.url).searchParams.get("secret"))) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const secret = process.env.AUTH_SECRET;
  const domain = process.env.REPLY_DOMAIN;
  if (!secret || !domain) {
    console.error("Inbound email received but AUTH_SECRET / REPLY_DOMAIN are not configured");
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const form = await req.formData();
  const field = (name: string) => {
    const v = form.get(name);
    return typeof v === "string" ? v : "";
  };

  const token = parseReplyAddress(`${field("to")} ${field("cc")} ${field("envelope")}`, secret, domain);
  if (!token) return NextResponse.json({ ok: true, ignored: "no-valid-reply-address" });

  const user = await db.user.findUnique({ where: { id: token.userId } });
  const sender = extractEmailAddress(field("from"));
  // The address was issued to this user; also require the mail to come from them.
  if (!user || !user.active || sender !== user.email) {
    return NextResponse.json({ ok: true, ignored: "sender-mismatch" });
  }

  const ticket = await db.ticket.findUnique({ where: { number: token.ticketNumber } });
  const viewer = { id: user.id, role: user.role, organizationId: user.organizationId };
  if (!ticket || !canViewTicket(viewer, ticket)) {
    return NextResponse.json({ ok: true, ignored: "no-access" });
  }

  const raw = field("text") || htmlToText(field("html"));
  const body = extractReplyText(raw).slice(0, 20_000);
  if (!body) return NextResponse.json({ ok: true, ignored: "empty" });

  const comment = await addComment({ ticketId: ticket.id, author: viewer, body, internal: false, source: "EMAIL" });
  after(() => notifyCommentAdded(comment.id));

  return NextResponse.json({ ok: true, commentId: comment.id });
}
