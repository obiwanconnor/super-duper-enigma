import type { Prisma, Role } from "@prisma/client";

export type Viewer = { id: string; role: Role; organizationId: string | null };

export const isStaff = (v: Viewer) => v.role === "AGENT" || v.role === "ADMIN";
export const isAdmin = (v: Viewer) => v.role === "ADMIN";

/**
 * Tickets a viewer may see: staff see everything, client stakeholders see all
 * tickets raised within their own organisation.
 */
export function ticketScope(v: Viewer): Prisma.TicketWhereInput {
  if (isStaff(v)) return {};
  if (!v.organizationId) return { id: "__none__" };
  return { organizationId: v.organizationId };
}

/** Products a viewer may raise tickets against and read articles for. */
export function productScope(v: Viewer): Prisma.ProductWhereInput {
  if (isStaff(v)) return {};
  if (!v.organizationId) return { id: "__none__" };
  return { organizationId: v.organizationId };
}

export function articleScope(v: Viewer): Prisma.ArticleWhereInput {
  if (isStaff(v)) return {};
  return { published: true, product: productScope(v) };
}

/** Internal notes are hidden from clients. */
export function commentScope(v: Viewer): Prisma.CommentWhereInput {
  return isStaff(v) ? {} : { internal: false };
}

export function canViewTicket(v: Viewer, ticket: { organizationId: string }): boolean {
  return isStaff(v) || (!!v.organizationId && v.organizationId === ticket.organizationId);
}
