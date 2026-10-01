import { db } from "./db";
import { deleteFiles } from "./storage";

/** Client data is kept until this long after their contract ends. */
export const RETENTION_YEARS = 2;

export function retentionEndsAt(contractEndsAt: Date | null): Date | null {
  if (!contractEndsAt) return null;
  const d = new Date(contractEndsAt);
  d.setUTCFullYear(d.getUTCFullYear() + RETENTION_YEARS);
  return d;
}

export function isPastRetention(contractEndsAt: Date | null, now = new Date()): boolean {
  const ends = retentionEndsAt(contractEndsAt);
  return !!ends && ends <= now;
}

/**
 * Permanently deletes a client: tickets (with comments, attachments, drafts,
 * ratings), its users, products and articles, then the stored files.
 */
export async function deleteOrganizationData(organizationId: string) {
  const attachments = await db.attachment.findMany({ where: { ticket: { organizationId } }, select: { storageKey: true } });

  const counts = await db.$transaction(async (tx) => {
    const tickets = await tx.ticket.deleteMany({ where: { organizationId } });
    const users = await tx.user.deleteMany({ where: { organizationId, role: "CLIENT" } });
    await tx.organization.delete({ where: { id: organizationId } });
    return { tickets: tickets.count, users: users.count };
  });

  // Files go after the database commit so a failure can't leave rows pointing at nothing.
  await deleteFiles(attachments.map((a) => a.storageKey));
  return { ...counts, files: attachments.length };
}
