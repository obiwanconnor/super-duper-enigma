import type { CommentSource, Prisma, TicketStatus } from "@prisma/client";
import { db } from "./db";
import type { Viewer } from "./access";
import { statusChangeData } from "./sla/sla";

/** A reply from the client puts the ticket back in the team's queue. */
export function statusAfterClientReply(status: TicketStatus): TicketStatus {
  switch (status) {
    case "WAITING_ON_CLIENT":
    case "RESOLVED":
    case "CLOSED":
      return "OPEN";
    default:
      return status;
  }
}

/** Whether a comment counts as the first response for SLA purposes. */
export function countsAsResponse(author: Viewer, internal: boolean): boolean {
  return !internal && author.role !== "CLIENT";
}

type Tx = Prisma.TransactionClient;

/** Changes a ticket's status, keeping SLA pause accounting consistent. */
export async function setTicketStatus(tx: Tx, ticketId: string, status: TicketStatus, now = new Date()) {
  const ticket = await tx.ticket.findUniqueOrThrow({ where: { id: ticketId } });
  if (ticket.status === status) return ticket;
  return tx.ticket.update({ where: { id: ticketId }, data: statusChangeData(ticket, status, now) });
}

/**
 * Adds a comment and applies the resulting status change. Callers are
 * responsible for checking the author may see the ticket.
 */
export async function addComment(opts: {
  ticketId: string;
  author: Viewer;
  body: string;
  internal: boolean;
  source: CommentSource;
  /** Optionally move the ticket to this status (staff and AI only). */
  setStatus?: TicketStatus;
}) {
  const internal = opts.internal && opts.author.role !== "CLIENT";
  const now = new Date();

  return db.$transaction(async (tx) => {
    const comment = await tx.comment.create({
      data: { ticketId: opts.ticketId, authorId: opts.author.id, body: opts.body, internal, source: opts.source },
    });

    const ticket = await tx.ticket.findUniqueOrThrow({ where: { id: opts.ticketId } });
    const nextStatus = opts.author.role === "CLIENT" ? statusAfterClientReply(ticket.status) : (opts.setStatus ?? ticket.status);

    await tx.ticket.update({
      where: { id: ticket.id },
      data: {
        ...(nextStatus !== ticket.status ? statusChangeData(ticket, nextStatus, now) : {}),
        ...(!ticket.firstRespondedAt && countsAsResponse(opts.author, internal) ? { firstRespondedAt: now } : {}),
        // Touch updatedAt so the ticket rises in the list.
        updatedAt: now,
      },
    });
    return comment;
  });
}
