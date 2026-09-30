"use server";

import { after } from "next/server";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { canViewTicket, isStaff, productScope } from "@/lib/access";
import { requireViewer } from "@/lib/session";
import { addComment, setTicketStatus } from "@/lib/tickets";
import { statusChangeData } from "@/lib/sla/sla";
import { filesFromForm, saveAttachments, validateUploads } from "@/lib/attachments";
import { notifyCommentAdded, notifyStatusChanged, notifyTicketCreated } from "@/lib/notifications";
import { initialAiStatus, runReplyDraft, runTriage } from "@/lib/ai/assistant";

const STATUS = z.enum(["OPEN", "IN_PROGRESS", "WAITING_ON_CLIENT", "RESOLVED", "CLOSED"]);

const newTicketSchema = z.object({
  productId: z.string().min(1),
  subject: z.string().trim().min(3, "Please add a short summary").max(200),
  description: z.string().trim().min(10, "Please describe the problem in a bit more detail").max(20_000),
  type: z.enum(["QUESTION", "BUG", "FEATURE_REQUEST", "INCIDENT"]),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
});

export async function createTicket(formData: FormData) {
  const viewer = await requireViewer();
  const parsed = newTicketSchema.safeParse({
    productId: formData.get("productId"),
    subject: formData.get("subject"),
    description: formData.get("description"),
    type: formData.get("type"),
    priority: formData.get("priority"),
  });
  if (!parsed.success) {
    redirect(`/tickets/new?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }
  const data = parsed.data;
  const files = await filesFromForm(formData);
  const uploadError = validateUploads(files);
  if (uploadError) redirect(`/tickets/new?error=${encodeURIComponent(uploadError)}`);

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
      aiStatus: await initialAiStatus(product.organizationId),
    },
  });
  await saveAttachments({ ticketId: ticket.id, commentId: null, uploadedById: viewer.id, files });

  after(async () => {
    await notifyTicketCreated(ticket.id);
    await runTriage(ticket.id);
  });
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
  const files = await filesFromForm(formData);
  const path = `/tickets/${ticket.number}`;
  if (!body && files.length === 0) redirect(path);
  const uploadError = validateUploads(files);
  if (uploadError) redirect(`${path}?error=${encodeURIComponent(uploadError)}`);

  const staff = isStaff(viewer);
  const setStatus = staff && formData.get("setStatus") ? STATUS.parse(formData.get("setStatus")) : undefined;
  const internal = formData.get("internal") === "on";

  const comment = await addComment({
    ticketId: ticket.id,
    author: viewer,
    body: body || "_(attachment)_",
    internal,
    source: "WEB",
    setStatus,
  });
  await saveAttachments({ ticketId: ticket.id, commentId: comment.id, uploadedById: viewer.id, files });

  // A staff reply answers whatever the AI had drafted.
  if (staff && !internal) {
    await db.aiDraft.updateMany({ where: { ticketId: ticket.id, status: "PENDING" }, data: { status: "SUPERSEDED", resolvedAt: new Date() } });
  }

  after(async () => {
    await notifyCommentAdded(comment.id);
    if (!staff) await runReplyDraft(ticket.id);
  });
  revalidatePath(path);
  redirect(`${path}#comment-${comment.id}`);
}

const staffUpdateSchema = z.object({
  status: STATUS,
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
  type: z.enum(["QUESTION", "BUG", "FEATURE_REQUEST", "INCIDENT"]),
  assigneeId: z.string(),
});

export async function updateTicket(formData: FormData) {
  const { viewer, ticket } = await loadTicketForViewer(String(formData.get("ticketId")));
  if (!isStaff(viewer)) notFound();

  const data = staffUpdateSchema.parse({
    status: formData.get("status"),
    priority: formData.get("priority"),
    type: formData.get("type"),
    assigneeId: formData.get("assigneeId") ?? "",
  });
  let assigneeId: string | null = null;
  if (data.assigneeId) {
    const assignee = await db.user.findFirst({ where: { id: data.assigneeId, role: { in: ["AGENT", "ADMIN"] }, active: true } });
    assigneeId = assignee?.id ?? null;
  }

  await db.ticket.update({
    where: { id: ticket.id },
    data: {
      ...(data.status !== ticket.status ? statusChangeData(ticket, data.status) : {}),
      priority: data.priority,
      type: data.type,
      assigneeId,
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

  await db.$transaction(async (tx) => {
    await setTicketStatus(tx, ticket.id, status);
    await tx.comment.create({
      data: {
        ticketId: ticket.id,
        authorId: viewer.id,
        body: status === "RESOLVED" ? "_Marked this ticket as resolved._" : "_Reopened this ticket._",
      },
    });
  });
  revalidatePath(`/tickets/${ticket.number}`);
}

// ---- AI drafts (staff) ------------------------------------------------------

async function loadDraftForStaff(draftId: string) {
  const viewer = await requireViewer();
  if (!isStaff(viewer)) notFound();
  const draft = await db.aiDraft.findUnique({ where: { id: draftId }, include: { ticket: true } });
  if (!draft) notFound();
  return { viewer, draft };
}

/** Sends the (possibly edited) AI draft to the client as the staff member. */
export async function sendDraft(formData: FormData) {
  const { viewer, draft } = await loadDraftForStaff(String(formData.get("draftId")));
  const path = `/tickets/${draft.ticket.number}`;
  if (draft.status !== "PENDING") redirect(`${path}?error=${encodeURIComponent("That suggestion has already been handled")}`);

  const body = String(formData.get("body") ?? "").trim().slice(0, 20_000);
  if (!body) redirect(path);
  const setStatus = formData.get("setStatus") ? STATUS.parse(formData.get("setStatus")) : undefined;

  const comment = await addComment({ ticketId: draft.ticketId, author: viewer, body, internal: false, source: "WEB", setStatus });
  await db.aiDraft.update({ where: { id: draft.id }, data: { status: "SENT", resolvedById: viewer.id, resolvedAt: new Date() } });

  after(() => notifyCommentAdded(comment.id));
  revalidatePath(path);
  redirect(`${path}#comment-${comment.id}`);
}

export async function discardDraft(formData: FormData) {
  const { viewer, draft } = await loadDraftForStaff(String(formData.get("draftId")));
  await db.aiDraft.updateMany({
    where: { id: draft.id, status: "PENDING" },
    data: { status: "DISCARDED", resolvedById: viewer.id, resolvedAt: new Date() },
  });
  revalidatePath(`/tickets/${draft.ticket.number}`);
}

export async function regenerateDraft(formData: FormData) {
  const { ticket, viewer } = await loadTicketForViewer(String(formData.get("ticketId")));
  if (!isStaff(viewer)) notFound();
  await runReplyDraft(ticket.id);
  revalidatePath(`/tickets/${ticket.number}`);
}

export async function retryTriage(formData: FormData) {
  const { ticket, viewer } = await loadTicketForViewer(String(formData.get("ticketId")));
  if (!isStaff(viewer)) notFound();
  await db.ticket.update({ where: { id: ticket.id }, data: { aiStatus: "PENDING", aiAttempts: 0 } });
  await runTriage(ticket.id);
  revalidatePath(`/tickets/${ticket.number}`);
}
