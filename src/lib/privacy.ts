import { db } from "./db";

export const ERASED_NAME = "Former user";

export function erasedEmail(userId: string) {
  return `erased-${userId}@erased.invalid`;
}

/**
 * Right to erasure: removes the person's identifying details and sign-in
 * methods but keeps ticket history intact. Text they wrote in tickets is
 * retained as part of the client's support record.
 */
export async function eraseUser(userId: string) {
  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: { name: ERASED_NAME, email: erasedEmail(userId), emailVerified: null, image: null, active: false },
    }),
    db.session.deleteMany({ where: { userId } }),
    db.account.deleteMany({ where: { userId } }),
    db.ticketWatcher.deleteMany({ where: { userId } }),
    db.satisfactionResponse.updateMany({ where: { userId }, data: { comment: null } }),
  ]);
}

/** Subject access request: everything the portal holds about one person. */
export async function exportUserData(userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    include: { organization: { select: { name: true } } },
  });

  const [requested, comments, attachments, watching, satisfaction, auditAbout, auditBy] = await Promise.all([
    db.ticket.findMany({
      where: { requesterId: userId },
      orderBy: { createdAt: "asc" },
      select: {
        number: true,
        subject: true,
        description: true,
        status: true,
        priority: true,
        createdAt: true,
        resolvedAt: true,
        product: { select: { name: true } },
        comments: {
          where: { internal: false },
          orderBy: { createdAt: "asc" },
          select: { body: true, createdAt: true, source: true, author: { select: { name: true } } },
        },
      },
    }),
    db.comment.findMany({
      where: { authorId: userId },
      orderBy: { createdAt: "asc" },
      select: { body: true, createdAt: true, internal: true, source: true, ticket: { select: { number: true } } },
    }),
    db.attachment.findMany({
      where: { uploadedById: userId },
      select: { filename: true, contentType: true, size: true, createdAt: true, ticket: { select: { number: true } } },
    }),
    db.ticketWatcher.findMany({ where: { userId }, select: { createdAt: true, ticket: { select: { number: true } } } }),
    db.satisfactionResponse.findMany({ where: { userId }, select: { rating: true, comment: true, createdAt: true, ticket: { select: { number: true } } } }),
    db.auditEvent.findMany({ where: { entityType: "user", entityId: userId }, orderBy: { createdAt: "asc" }, select: { action: true, summary: true, createdAt: true } }),
    db.auditEvent.findMany({ where: { actorId: userId }, orderBy: { createdAt: "asc" }, select: { action: true, summary: true, createdAt: true } }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    note:
      "Internal staff notes are not included automatically. Before responding to a subject access request, " +
      "search internal notes for this person and decide what to disclose.",
    profile: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
      organization: user.organization?.name ?? null,
      createdAt: user.createdAt,
    },
    ticketsRaised: requested,
    commentsWritten: comments,
    filesUploaded: attachments,
    copiedInOn: watching,
    satisfactionRatings: satisfaction,
    accountHistory: auditAbout,
    actionsTaken: auditBy,
  };
}
