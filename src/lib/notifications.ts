import type { TicketStatus } from "@prisma/client";
import { db } from "./db";
import { appUrl } from "./config";
import { sendEmail } from "./email/send";
import { renderEmail } from "./email/templates";
import { replyAddress } from "./email/reply-token";
import { statusLabels } from "./labels";
import { RATINGS, ratingLabels, surveyToken } from "./survey";

type Recipient = { id: string; email: string; name: string | null };

function replyToFor(ticketNumber: number, userId: string): string | undefined {
  const secret = process.env.AUTH_SECRET;
  const domain = process.env.REPLY_DOMAIN;
  if (!secret || !domain) return undefined;
  return replyAddress(ticketNumber, userId, secret, domain);
}

type Links = { heading: string; items: { label: string; url: string }[] };

async function deliver(
  recipients: Recipient[],
  ticket: { number: number; subject: string },
  heading: string,
  bodyText: string,
  linksFor?: (r: Recipient) => Links | undefined,
) {
  const url = appUrl(`/tickets/${ticket.number}`);
  const unique = new Map(recipients.map((r) => [r.id, r]));
  await Promise.all(
    [...unique.values()].map(async (r) => {
      const replyTo = replyToFor(ticket.number, r.id);
      const { text, html } = renderEmail({
        heading,
        bodyText,
        action: { label: `View ticket #${ticket.number}`, url },
        replyable: !!replyTo,
        links: linksFor?.(r),
      });
      try {
        await sendEmail({ to: r.email, subject: `[#${ticket.number}] ${ticket.subject}`, text, html, replyTo });
      } catch (err) {
        console.error(`Failed to email ${r.email} about ticket #${ticket.number}`, err);
      }
    }),
  );
}

const recipientSelect = { id: true, email: true, name: true } as const;

async function staffRecipients(assigneeId: string | null): Promise<Recipient[]> {
  if (assigneeId) {
    const assignee = await db.user.findFirst({ where: { id: assigneeId, active: true }, select: recipientSelect });
    if (assignee) return [assignee];
  }
  return db.user.findMany({ where: { role: { in: ["AGENT", "ADMIN"] }, active: true }, select: recipientSelect });
}

/** Client-side participants: the requester, colleagues copied in, and any client who has commented. */
async function clientParticipants(ticketId: string, requester: Recipient): Promise<Recipient[]> {
  const others = await db.user.findMany({
    where: {
      role: "CLIENT",
      active: true,
      OR: [{ comments: { some: { ticketId } } }, { watching: { some: { ticketId } } }],
    },
    select: recipientSelect,
  });
  return [requester, ...others];
}

export async function notifyTicketCreated(ticketId: string) {
  const t = await db.ticket.findUnique({
    where: { id: ticketId },
    include: { requester: { select: recipientSelect }, organization: true, product: true },
  });
  if (!t) return;

  await deliver(
    await staffRecipients(t.assigneeId),
    t,
    `New ticket from ${t.organization.name}`,
    `${t.requester.name ?? t.requester.email} raised a ticket for ${t.product.name}:\n\n${t.subject}\n\n${t.description}`,
  );
  await deliver(
    await clientParticipants(t.id, t.requester),
    t,
    `We've received your request`,
    `Thanks — your ticket #${t.number} for ${t.product.name} has been logged and our team will be in touch.\n\n${t.description}`,
  );
}

export async function notifyCommentAdded(commentId: string) {
  const c = await db.comment.findUnique({
    where: { id: commentId },
    include: {
      author: { select: { ...recipientSelect, role: true } },
      ticket: { include: { requester: { select: recipientSelect } } },
    },
  });
  if (!c) return;
  const t = c.ticket;
  const authorName = c.author.name ?? c.author.email;
  const authorIsStaff = c.author.role !== "CLIENT";

  let recipients: Recipient[];
  if (c.internal) {
    recipients = t.assigneeId ? await staffRecipients(t.assigneeId) : [];
  } else if (authorIsStaff) {
    recipients = await clientParticipants(t.id, t.requester);
  } else {
    // A client replied: tell the team, and other client participants.
    recipients = [...(await staffRecipients(t.assigneeId)), ...(await clientParticipants(t.id, t.requester))];
  }

  await deliver(
    recipients.filter((r) => r.id !== c.authorId),
    t,
    c.internal ? `Internal note from ${authorName}` : `${authorName} replied`,
    c.body,
  );
}

export async function notifyStatusChanged(ticketId: string, status: TicketStatus, actorId: string) {
  if (status !== "RESOLVED" && status !== "WAITING_ON_CLIENT" && status !== "CLOSED") return;
  const t = await db.ticket.findUnique({ where: { id: ticketId }, include: { requester: { select: recipientSelect } } });
  if (!t) return;
  const recipients = (await clientParticipants(t.id, t.requester)).filter((r) => r.id !== actorId);
  if (recipients.length === 0) return;

  const body =
    status === "RESOLVED"
      ? "We believe this ticket is resolved. If anything is still wrong, just reply and it will be reopened."
      : status === "WAITING_ON_CLIENT"
        ? "We need some more information from you to continue. Please reply with the details requested on the ticket."
        : "This ticket has been closed.";

  const secret = process.env.AUTH_SECRET;
  const surveyLinks =
    status === "RESOLVED" && secret
      ? (r: Recipient): Links => ({
          heading: "How did we do? Choose a rating (you can add a comment on the next page):",
          items: RATINGS.map((rating) => ({
            label: ratingLabels[rating],
            url: appUrl(`/survey/${surveyToken(t.number, r.id, secret)}?rating=${rating}`),
          })),
        })
      : undefined;

  await deliver(recipients, t, `Status: ${statusLabels[status]}`, body, surveyLinks);
}

export async function notifyWatcherAdded(ticketId: string, userId: string, addedByName: string) {
  const [t, user] = await Promise.all([
    db.ticket.findUnique({ where: { id: ticketId }, select: { number: true, subject: true, description: true } }),
    db.user.findUnique({ where: { id: userId }, select: recipientSelect }),
  ]);
  if (!t || !user) return;
  await deliver(
    [user],
    t,
    `${addedByName} copied you in on ticket #${t.number}`,
    `You'll now get updates about this ticket by email, and you can reply to them.\n\n${t.subject}\n\n${t.description}`,
  );
}

export async function notifySlaBreach(ticketId: string, clock: "firstResponse" | "resolution") {
  const t = await db.ticket.findUnique({ where: { id: ticketId }, include: { organization: { select: { name: true } } } });
  if (!t) return;
  const what = clock === "firstResponse" ? "first-response" : "resolution";
  const url = appUrl(`/tickets/${t.number}`);
  const recipients = await staffRecipients(t.assigneeId);
  const { text, html } = renderEmail({
    heading: `SLA breached: ${what} target`,
    bodyText: `Ticket #${t.number} for ${t.organization.name} (${t.priority.toLowerCase()} priority) has passed its ${what} target.\n\n${t.subject}`,
    action: { label: `Open ticket #${t.number}`, url },
  });
  await Promise.all(
    recipients.map((r) =>
      sendEmail({ to: r.email, subject: `[SLA breach] #${t.number} ${t.subject}`, text, html }).catch((err) =>
        console.error(`Failed to send SLA alert to ${r.email}`, err),
      ),
    ),
  );
}
