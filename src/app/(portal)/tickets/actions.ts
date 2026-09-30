"use server";

import { after } from "next/server";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { canViewTicket, isStaff, productScope } from "@/lib/access";
import { requireViewer } from "@/lib/session";
import { addComment, resolvedAtFor } from "@/lib/tickets";
import { notifyCommentAdded, notifyStatusChanged, notifyTicketCreated } from "@/lib/notifications";

const newTicketSchema = z.object({
  productId: z.string().min(1),
  subject: z.string().trim().min(3, "Please add a short summary").max(200),
  description: z.string().trim().min(10, "Please describe the problem in a bit more detail").max(20_000),
  type: z.enum(["QUESTION", "BUG", "FEATURE_REQUEST", "INCIDENT"]),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
});

export async function createTicket(formData: FormData) {
  const viewer = await requireViewer();
  const parsed = newTicketSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/tickets/new?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }
  const data = parsed.data;

  const product = await db.product.findFirst({ where: { AND: [{ id: data.productId }, productScope(viewer)] } });
  if (!product) notFound();

  const ticket = await db.ticket.create({
    data: {
      subject: data.subject,
      description: data.description,
      type: data.type,
      priority: data.priority,
      productId: product.id,
      organizationId: product.organizationId,
      requesterId: viewer.id,
    },
  });

  after(() => notifyTicketCreated(ticket.id));
  redirect(`/tickets/${ticket.number}`);
}

async function loadTicketForViewer(ticketId: string) {
  const viewer = await requireViewer();
  const ticket = await db.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket || !canViewTicket(viewer, ticket)) notFound();
  return { viewer, ticket };
}

export async function postComment(formData: FormData) {
  const { viewer, ticket } = await loadTicketForViewer(String(formData.get("ticketId")));
  const body = String(formData.get("body") ?? "").trim().slice(0, 20_000);
  if (!body) redirect(`/tickets/${ticket.number}`);

  const comment = await addComment({
    ticketId: ticket.id,
    author: viewer,
    body,
    internal: formData.get("internal") === "on",
    source: "WEB",
  });

  // Staff can reply and change status in one go.
  const nextStatus = String(formData.get("setStatus") ?? "");
  if (isStaff(viewer) && nextStatus && nextStatus !== ticket.status) {
    const status = z.enum(["OPEN", "IN_PROGRESS", "WAITING_ON_CLIENT", "RESOLVED", "CLOSED"]).parse(nextStatus);
    await db.ticket.update({ where: { id: ticket.id }, data: { status, resolvedAt: resolvedAtFor(status, ticket.resolvedAt) } });
    // The comment email already tells the client; skip a second status email.
  }

  after(() => notifyCommentAdded(comment.id));
  revalidatePath(`/tickets/${ticket.number}`);
  redirect(`/tickets/${ticket.number}#comment-${comment.id}`);
}

const staffUpdateSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "WAITING_ON_CLIENT", "RESOLVED", "CLOSED"]),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
  type: z.enum(["QUESTION", "BUG", "FEATURE_REQUEST", "INCIDENT"]),
  assigneeId: z.string(),
});

export async function updateTicket(formData: FormData) {
  const { viewer, ticket } = await loadTicketForViewer(String(formData.get("ticketId")));
  if (!isStaff(viewer)) notFound();

  const data = staffUpdateSchema.parse(Object.fromEntries(formData));
  let assigneeId: string | null = null;
  if (data.assigneeId) {
    const assignee = await db.user.findFirst({ where: { id: data.assigneeId, role: { in: ["AGENT", "ADMIN"] }, active: true } });
    assigneeId = assignee?.id ?? null;
  }

  await db.ticket.update({
    where: { id: ticket.id },
    data: {
      status: data.status,
      priority: data.priority,
      type: data.type,
      assigneeId,
      resolvedAt: resolvedAtFor(data.status, ticket.resolvedAt),
    },
  });

  if (data.status !== ticket.status) {
    after(() => notifyStatusChanged(ticket.id, data.status, viewer.id));
  }
  revalidatePath(`/tickets/${ticket.number}`);
}

/** Clients can mark their ticket resolved, or reopen it. */
export async function clientSetStatus(formData: FormData) {
  const { viewer, ticket } = await loadTicketForViewer(String(formData.get("ticketId")));
  const status = z.enum(["RESOLVED", "OPEN"]).parse(formData.get("status"));
  if (status === ticket.status) return;

  await db.ticket.update({ where: { id: ticket.id }, data: { status, resolvedAt: resolvedAtFor(status, ticket.resolvedAt) } });
  await db.comment.create({
    data: {
      ticketId: ticket.id,
      authorId: viewer.id,
      body: status === "RESOLVED" ? "_Marked this ticket as resolved._" : "_Reopened this ticket._",
    },
  });
  revalidatePath(`/tickets/${ticket.number}`);
}
