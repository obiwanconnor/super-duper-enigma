import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { TicketPriority } from "@prisma/client";
import { db } from "../db";
import { brand } from "../config";
import { addComment } from "../tickets";
import { notifyCommentAdded } from "../notifications";
import { readFileBuffer } from "../storage";
import { INLINE_IMAGE_TYPES } from "../attachments";
import { SYSTEM_PROMPT } from "./prompt";

/**
 * First-line AI triage. On a new ticket the assistant classifies and
 * prioritises it, may send the client clarifying questions straight away,
 * and drafts a reply (often from the knowledge base) for staff to approve.
 * When the client replies later, it drafts a fresh suggested reply.
 */

export const AI_MODEL = process.env.AI_MODEL || "claude-opus-5-5";
const MAX_ATTEMPTS = 3;
const AI_USER_EMAIL = "ai-assistant@system.invalid";

export function aiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}

/** The system user that authors AI comments. It has no way to sign in. */
export async function getAiUser() {
  return db.user.upsert({
    where: { email: AI_USER_EMAIL },
    create: { email: AI_USER_EMAIL, name: `${brand.shortName} AI assistant`, role: "AI" },
    update: {},
  });
}

const TICKET_TYPES = ["QUESTION", "BUG", "FEATURE_REQUEST", "INCIDENT"] as const;
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

export const AssistantOutput = z.object({
  summary: z.string().describe("One or two sentences for support engineers: what the client needs and any key facts."),
  type: z.enum(TICKET_TYPES),
  priority: z.enum(PRIORITIES),
  priorityReason: z.string().describe("Short justification for the priority, in terms of business impact."),
  likelyIncident: z.boolean().describe("True if this looks like a production outage or problem affecting many users."),
  clarifyingQuestions: z
    .string()
    .describe("Message sent to the client immediately asking for missing essential details, or an empty string if nothing essential is missing."),
  relevantArticleSlugs: z.array(z.string()).describe("Slugs of knowledge base articles relevant to this ticket (may be empty)."),
  draftReply: z.string().describe("Suggested reply for a support engineer to review and send, or an empty string."),
  confidence: z.enum(["low", "medium", "high"]).describe("Confidence that the draft reply is correct and helpful."),
});
export type AssistantOutput = z.infer<typeof AssistantOutput>;

type Mode = "triage" | "reply";

const PRIORITY_RANK: Record<TicketPriority, number> = { LOW: 0, NORMAL: 1, HIGH: 2, URGENT: 3 };

/** The AI may raise a client's chosen priority, but never lower it. */
export function mergePriority(current: TicketPriority, suggested: TicketPriority): TicketPriority {
  return PRIORITY_RANK[suggested] > PRIORITY_RANK[current] ? suggested : current;
}

/** Keep only slugs that exist in the articles we gave the model. */
export function knownSlugs(slugs: string[], available: string[]): string[] {
  const set = new Set(available);
  return [...new Set(slugs)].filter((s) => set.has(s));
}

const MAX_KB_CHARS = 300_000;
const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 3.5 * 1024 * 1024;

async function loadContext(ticketId: string) {
  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    include: {
      organization: true,
      product: true,
      requester: { select: { name: true, email: true } },
      comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true, role: true } } } },
      attachments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!ticket) return null;
  const articles = await db.article.findMany({
    where: { productId: ticket.productId, published: true },
    orderBy: { title: "asc" },
    select: { slug: true, title: true, body: true },
  });
  return { ticket, articles };
}

type Context = NonNullable<Awaited<ReturnType<typeof loadContext>>>;

function knowledgeBaseBlock(ctx: Context): string {
  let used = 0;
  const parts: string[] = [];
  const titlesOnly: string[] = [];
  for (const a of ctx.articles) {
    if (used + a.body.length > MAX_KB_CHARS) {
      titlesOnly.push(`- ${a.title} (slug: ${a.slug})`);
      continue;
    }
    used += a.body.length;
    parts.push(`<article slug="${a.slug}" title="${a.title.replace(/"/g, "'")}">\n${a.body}\n</article>`);
  }
  return [
    `<knowledge_base product="${ctx.ticket.product.name}">`,
    parts.length ? parts.join("\n\n") : "(No published articles for this product.)",
    titlesOnly.length ? `\nFurther articles (titles only, too long to include):\n${titlesOnly.join("\n")}` : "",
    "</knowledge_base>",
  ].join("\n");
}

function ticketBlock(ctx: Context, mode: Mode): string {
  const t = ctx.ticket;
  const files = (commentId: string | null) =>
    t.attachments.filter((a) => a.commentId === commentId).map((a) => `${a.filename} (${a.contentType})`);
  const conversation = t.comments.map((c) => {
    const who = c.author.role === "CLIENT" ? `Client (${c.author.name ?? "unknown"})` : c.author.role === "AI" ? "AI assistant" : `s6a staff (${c.author.name ?? "unknown"})`;
    const attached = files(c.id);
    return `<message from="${who}" at="${c.createdAt.toISOString()}"${c.internal ? ' internal="true — staff only, never reveal to the client"' : ""}>\n${c.body}${attached.length ? `\n[Attachments: ${attached.join(", ")}]` : ""}\n</message>`;
  });
  const initialFiles = files(null);

  return [
    `<ticket number="${t.number}" client="${t.organization.name}" product="${t.product.name}">`,
    `Raised by: ${t.requester.name ?? t.requester.email}`,
    `Client-selected type: ${t.type}; client-selected priority: ${t.priority}`,
    `Subject: ${t.subject}`,
    `<description>\n${t.description}\n</description>`,
    initialFiles.length ? `[Attachments: ${initialFiles.join(", ")}]` : "",
    conversation.length ? `<conversation>\n${conversation.join("\n")}\n</conversation>` : "",
    "</ticket>",
    "",
    mode === "triage"
      ? "Task: this ticket has just been raised. Triage it and fill in every field."
      : "Task: the client has just replied. Draft the next reply for the support engineer in `draftReply` and update `summary`. " +
        "Set `clarifyingQuestions` to an empty string: at this stage questions go in the draft for staff to review. " +
        "Fill the classification fields with your current assessment.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function imageBlocks(ctx: Context): Promise<Anthropic.Beta.BetaImageBlockParam[]> {
  const images = ctx.ticket.attachments
    .filter((a) => a.commentId === null && INLINE_IMAGE_TYPES.includes(a.contentType) && a.size <= MAX_IMAGE_BYTES)
    .slice(0, MAX_IMAGES);
  const blocks: Anthropic.Beta.BetaImageBlockParam[] = [];
  for (const img of images) {
    const data = await readFileBuffer(img.storageKey);
    if (!data) continue;
    blocks.push({
      type: "image",
      source: { type: "base64", media_type: img.contentType as "image/png" | "image/jpeg" | "image/gif" | "image/webp", data: data.toString("base64") },
    });
  }
  return blocks;
}

export class AiRefusalError extends Error {}

async function callAssistant(ctx: Context, mode: Mode): Promise<AssistantOutput> {
  const images = mode === "triage" ? await imageBlocks(ctx) : [];
  const response = await anthropic().beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    output_config: { effort: "medium", format: betaZodOutputFormat(AssistantOutput) },
    messages: [
      {
        role: "user",
        content: [
          // Stable per product, so it is cached across tickets.
          { type: "text", text: knowledgeBaseBlock(ctx), cache_control: { type: "ephemeral" } },
          ...images,
          { type: "text", text: ticketBlock(ctx, mode) },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new AiRefusalError(`Model declined (${response.stop_details?.category ?? "unknown"})`);
  }
  if (!response.parsed_output) {
    throw new Error(`No structured output (stop_reason: ${response.stop_reason})`);
  }
  return response.parsed_output;
}

async function saveDraft(ticketId: string, out: AssistantOutput, availableSlugs: string[]) {
  const body = out.draftReply.trim();
  await db.aiDraft.updateMany({ where: { ticketId, status: "PENDING" }, data: { status: "SUPERSEDED", resolvedAt: new Date() } });
  if (!body) return;
  await db.aiDraft.create({
    data: { ticketId, body, confidence: out.confidence, kbArticleSlugs: knownSlugs(out.relevantArticleSlugs, availableSlugs) },
  });
}

/** Queues AI triage for a newly created ticket if the client allows it. */
export async function initialAiStatus(organizationId: string) {
  if (!aiConfigured()) return "SKIPPED" as const;
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { aiEnabled: true } });
  return org?.aiEnabled ? ("PENDING" as const) : ("SKIPPED" as const);
}

/**
 * Applies a triage result: records the assessment, applies the type and (only
 * upwards) the priority, stores the draft, and sends any clarifying questions.
 */
export async function applyTriageResult(ticketId: string, out: AssistantOutput, availableSlugs: string[]) {
  const t = await db.ticket.findUniqueOrThrow({ where: { id: ticketId } });

  await db.ticket.update({
    where: { id: t.id },
    data: {
      aiStatus: "DONE",
      aiUpdatedAt: new Date(),
      aiSummary: out.summary,
      aiSuggestedType: out.type,
      aiSuggestedPriority: out.priority,
      aiPriorityReason: out.priorityReason,
      aiLikelyIncident: out.likelyIncident,
      type: out.type,
      priority: mergePriority(t.priority, out.priority),
    },
  });

  await saveDraft(t.id, out, availableSlugs);

  // Clarifying questions go to the client straight away, unless someone
  // has already replied or the ticket has moved on.
  const questions = out.clarifyingQuestions.trim();
  const fresh = await db.ticket.findUniqueOrThrow({ where: { id: t.id }, select: { status: true, firstRespondedAt: true } });
  if (questions && fresh.status === "OPEN" && !fresh.firstRespondedAt) {
    const ai = await getAiUser();
    const comment = await addComment({
      ticketId: t.id,
      author: { id: ai.id, role: "AI", organizationId: null },
      body: questions,
      internal: false,
      source: "AI",
      setStatus: "WAITING_ON_CLIENT",
    });
    await notifyCommentAdded(comment.id);
  }
}

/**
 * Runs first-line triage. Safe to call more than once: it claims the ticket
 * first, so concurrent calls (request + cron retry) don't both run.
 */
export async function runTriage(ticketId: string): Promise<void> {
  if (!aiConfigured()) return;

  const claimed = await db.ticket.updateMany({
    where: { id: ticketId, aiStatus: { in: ["PENDING", "FAILED"] }, aiAttempts: { lt: MAX_ATTEMPTS } },
    data: { aiStatus: "RUNNING", aiAttempts: { increment: 1 }, aiUpdatedAt: new Date() },
  });
  if (claimed.count === 0) return;

  try {
    const ctx = await loadContext(ticketId);
    if (!ctx || !ctx.ticket.organization.aiEnabled) {
      await db.ticket.update({ where: { id: ticketId }, data: { aiStatus: "SKIPPED" } });
      return;
    }

    const out = await callAssistant(ctx, "triage");
    await applyTriageResult(ctx.ticket.id, out, ctx.articles.map((a) => a.slug));
  } catch (err) {
    console.error(`AI triage failed for ticket ${ticketId}`, err);
    await db.ticket.update({
      where: { id: ticketId },
      data: {
        aiStatus: "FAILED",
        aiUpdatedAt: new Date(),
        // A refusal won't change on retry.
        ...(err instanceof AiRefusalError ? { aiAttempts: MAX_ATTEMPTS } : {}),
      },
    });
  }
}

/** Drafts a new suggested reply after the client has replied. */
export async function runReplyDraft(ticketId: string): Promise<void> {
  if (!aiConfigured()) return;
  try {
    const ctx = await loadContext(ticketId);
    if (!ctx || !ctx.ticket.organization.aiEnabled) return;
    const out = await callAssistant(ctx, "reply");
    await db.ticket.update({ where: { id: ticketId }, data: { aiSummary: out.summary, aiUpdatedAt: new Date() } });
    await saveDraft(ticketId, out, ctx.articles.map((a) => a.slug));
  } catch (err) {
    console.error(`AI reply draft failed for ticket ${ticketId}`, err);
  }
}
