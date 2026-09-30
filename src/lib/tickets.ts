import type { CommentSource, TicketStatus } from "@prisma/client";
import { db } from "./db";
import { isStaff, type Viewer } from "./access";

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

export function resolvedAtFor(status: TicketStatus, previous: Date | null): Date | null {
  if (status === "RESOLVED" || status === "CLOSED") return previous ?? new Date();
  return null;
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
}) {
  const internal = opts.internal && isStaff(opts.author);

  return db.$transaction(async (tx) => {
    const comment = await tx.comment.create({
      data: { ticketId: opts.ticketId, authorId: opts.author.id, body: opts.body, internal, source: opts.source },
    });

    const ticket = await tx.ticket.findUniqueOrThrow({ where: { id: opts.ticketId } });
    if (!isStaff(opts.author)) {
      const status = statusAfterClientReply(ticket.status);
      await tx.ticket.update({
        where: { id: ticket.id },
        data: { status, resolvedAt: resolvedAtFor(status, ticket.resolvedAt) },
      });
    } else {
      // Touch updatedAt so the ticket rises in the list.
      await tx.ticket.update({ where: { id: ticket.id }, data: { updatedAt: new Date() } });
    }
    return comment;
  });
}
