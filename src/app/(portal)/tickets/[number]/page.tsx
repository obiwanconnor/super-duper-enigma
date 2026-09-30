import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { canViewTicket, commentScope, isStaff } from "@/lib/access";
import { requireViewer } from "@/lib/session";
import { OPEN_STATUSES, priorityLabels, staffStatusLabels, typeLabels } from "@/lib/labels";
import { loadTargets, slaFor } from "@/lib/sla/targets";
import { PriorityBadge, StatusBadge } from "@/components/badges";
import { AttachmentList, FileInput } from "@/components/attachments";
import { Flash } from "@/components/flash";
import { Markdown } from "@/components/markdown";
import { SlaBadge } from "@/components/sla";
import { SubmitButton } from "@/components/submit-button";
import { Time } from "@/components/time";
import { clientSetStatus, discardDraft, postComment, regenerateDraft, retryTriage, sendDraft, updateTicket } from "../actions";

export async function generateMetadata({ params }: { params: Promise<{ number: string }> }) {
  return { title: `Ticket #${(await params).number}` };
}

export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ number: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const viewer = await requireViewer();
  const number = Number((await params).number);
  const { error } = await searchParams;
  if (!Number.isInteger(number)) notFound();

  const ticket = await db.ticket.findUnique({
    where: { number },
    include: {
      product: true,
      organization: true,
      requester: { select: { name: true, email: true } },
      assignee: { select: { id: true, name: true, email: true } },
      comments: {
        where: commentScope(viewer),
        orderBy: { createdAt: "asc" },
        include: { author: { select: { name: true, email: true, role: true } } },
      },
      attachments: { orderBy: { createdAt: "asc" }, select: { id: true, filename: true, contentType: true, size: true, commentId: true } },
      // AI drafts are for staff eyes only; never load them for clients.
      drafts: isStaff(viewer) ? { where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 1 } : false,
    },
  });
  if (!ticket || !canViewTicket(viewer, ticket)) notFound();

  const staff = isStaff(viewer);
  const [agents, targets, articles] = staff
    ? await Promise.all([
        db.user.findMany({ where: { role: { in: ["AGENT", "ADMIN"] }, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
        loadTargets([ticket.organizationId]),
        db.article.findMany({ where: { slug: { in: ticket.drafts?.[0]?.kbArticleSlugs ?? [] } }, select: { slug: true, title: true } }),
      ])
    : [[], new Map(), []];
  const sla = staff ? slaFor(ticket, targets) : null;
  const draft = ticket.drafts?.[0];
  const isOpen = OPEN_STATUSES.includes(ticket.status);
  const visibleCommentIds = new Set(ticket.comments.map((c) => c.id));
  const attachmentsFor = (commentId: string | null) => ticket.attachments.filter((a) => a.commentId === commentId);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0">
        <Link href="/tickets" className="text-sm link">
          ← All tickets
        </Link>
        <div className="mt-2 mb-6">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span>#{ticket.number}</span>
            <StatusBadge status={ticket.status} staff={staff} />
            <PriorityBadge priority={ticket.priority} />
            {staff && ticket.aiLikelyIncident && (
              <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">Possible incident</span>
            )}
          </div>
          <h1 className="mt-2 text-2xl font-semibold break-words">{ticket.subject}</h1>
        </div>

        <Flash error={error} />

        {staff && <AiPanel ticket={ticket} />}

        <ol className="space-y-4">
          <li className="card p-5">
            <Header name={ticket.requester.name ?? ticket.requester.email} date={ticket.createdAt} />
            <div className="mt-3 text-sm">
              <Markdown>{ticket.description}</Markdown>
            </div>
            <AttachmentList attachments={attachmentsFor(null)} />
          </li>
          {ticket.comments.map((c) => {
            const role = c.author.role;
            const tag = c.internal ? "Internal note" : role === "AI" ? "AI assistant" : role !== "CLIENT" && !staff ? "Support team" : undefined;
            return (
              <li
                key={c.id}
                id={`comment-${c.id}`}
                className={`card p-5 ${c.internal ? "border-amber-200 bg-amber-50" : role === "AI" ? "border-violet-200 bg-violet-50/40" : role !== "CLIENT" ? "border-brand-100" : ""}`}
              >
                <Header name={c.author.name ?? c.author.email} date={c.createdAt} tag={tag} via={c.source === "EMAIL" ? "email" : undefined} />
                <div className="mt-3 text-sm">
                  <Markdown>{c.body}</Markdown>
                </div>
                {visibleCommentIds.has(c.id) && <AttachmentList attachments={attachmentsFor(c.id)} />}
              </li>
            );
          })}
        </ol>

        {staff && draft && (
          <section className="card mt-6 border-violet-200 p-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Suggested reply</h2>
              <span className="text-xs text-slate-500">
                AI draft · {draft.confidence} confidence · <Time date={draft.createdAt} />
              </span>
            </div>
            {articles.length > 0 && (
              <p className="mb-2 text-xs text-slate-600">
                Based on:{" "}
                {articles.map((a, i) => (
                  <span key={a.slug}>
                    {i > 0 && ", "}
                    <Link href={`/kb/${a.slug}`} className="link" target="_blank">
                      {a.title}
                    </Link>
                  </span>
                ))}
              </p>
            )}
            <form action={sendDraft} className="space-y-3">
              <input type="hidden" name="draftId" value={draft.id} />
              <textarea name="body" rows={8} defaultValue={draft.body} className="input" aria-label="Suggested reply" />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm">
                  Set status
                  <select name="setStatus" defaultValue="" className="input w-auto py-1">
                    <option value="">(unchanged)</option>
                    {Object.entries(staffStatusLabels).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex gap-2">
                  <SubmitButton className="btn-secondary" pendingText="Discarding…" formAction={discardDraft}>
                    Discard
                  </SubmitButton>
                  <SubmitButton pendingText="Sending…">Approve &amp; send</SubmitButton>
                </div>
              </div>
            </form>
          </section>
        )}

        <form action={postComment} className="card mt-6 space-y-3 p-5">
          <input type="hidden" name="ticketId" value={ticket.id} />
          <label htmlFor="body" className="label">
            {isOpen ? "Add a reply" : "Reply to reopen this ticket"}
          </label>
          <textarea id="body" name="body" rows={5} className="input" placeholder="Markdown supported" />
          <FileInput />
          <div className="flex flex-wrap items-center justify-between gap-3">
            {staff ? (
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="internal" /> Internal note
                </label>
                <label className="flex items-center gap-2">
                  and set status
                  <select name="setStatus" defaultValue="" className="input w-auto py-1">
                    <option value="">(unchanged)</option>
                    {Object.entries(staffStatusLabels).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : (
              <span />
            )}
            <SubmitButton pendingText="Sending…">Send</SubmitButton>
          </div>
        </form>
      </div>

      <aside className="space-y-4">
        {sla && (
          <div className="card space-y-3 p-5 text-sm">
            <div className="text-xs uppercase tracking-wide text-slate-500">SLA (business hours)</div>
            <div className="flex items-center justify-between gap-2">
              <span>First response</span>
              <SlaBadge clock={sla.firstResponse} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>Resolution</span>
              <SlaBadge clock={sla.resolution} />
            </div>
          </div>
        )}

        <div className="card space-y-3 p-5 text-sm">
          <Field label="Client">{ticket.organization.name}</Field>
          <Field label="Product">{ticket.product.name}</Field>
          <Field label="Type">{typeLabels[ticket.type]}</Field>
          <Field label="Raised by">{ticket.requester.name ?? ticket.requester.email}</Field>
          <Field label="Created">
            <Time date={ticket.createdAt} />
          </Field>
          {!staff && <Field label="Assigned to">{ticket.assignee ? (ticket.assignee.name ?? ticket.assignee.email) : "Not yet assigned"}</Field>}
        </div>

        {staff ? (
          <>
            <form action={updateTicket} className="card space-y-3 p-5">
              <input type="hidden" name="ticketId" value={ticket.id} />
              <Select name="status" label="Status" value={ticket.status} options={staffStatusLabels} />
              <Select name="priority" label="Priority" value={ticket.priority} options={priorityLabels} />
              <Select name="type" label="Type" value={ticket.type} options={typeLabels} />
              <div>
                <label className="label" htmlFor="assigneeId">
                  Assignee
                </label>
                <select id="assigneeId" name="assigneeId" defaultValue={ticket.assignee?.id ?? ""} className="input">
                  <option value="">Unassigned</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name ?? a.email}
                    </option>
                  ))}
                </select>
              </div>
              <SubmitButton className="btn-primary w-full" pendingText="Saving…">
                Update
              </SubmitButton>
            </form>
            {ticket.organization.aiEnabled && (
              <form action={regenerateDraft} className="card p-5">
                <input type="hidden" name="ticketId" value={ticket.id} />
                <SubmitButton className="btn-secondary w-full" pendingText="Drafting…">
                  {draft ? "Redraft suggested reply" : "Draft a reply with AI"}
                </SubmitButton>
              </form>
            )}
          </>
        ) : (
          <form action={clientSetStatus} className="card p-5">
            <input type="hidden" name="ticketId" value={ticket.id} />
            {isOpen ? (
              <SubmitButton className="btn-secondary w-full" name="status" value="RESOLVED">
                Mark as resolved
              </SubmitButton>
            ) : (
              <SubmitButton className="btn-secondary w-full" name="status" value="OPEN">
                Reopen ticket
              </SubmitButton>
            )}
          </form>
        )}
      </aside>
    </div>
  );
}

type AiTicket = {
  id: string;
  aiStatus: string;
  aiSummary: string | null;
  aiSuggestedType: keyof typeof typeLabels | null;
  aiSuggestedPriority: keyof typeof priorityLabels | null;
  aiPriorityReason: string | null;
  priority: keyof typeof priorityLabels;
  organization: { aiEnabled: boolean };
};

function AiPanel({ ticket }: { ticket: AiTicket }) {
  if (ticket.aiStatus === "SKIPPED" && !ticket.aiSummary) return null;
  return (
    <section className="mb-6 rounded-lg border border-violet-200 bg-violet-50/50 p-4 text-sm">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-semibold text-violet-900">AI triage</span>
        {(ticket.aiStatus === "PENDING" || ticket.aiStatus === "RUNNING") && <span className="text-xs text-violet-700">Working…</span>}
      </div>
      {ticket.aiStatus === "FAILED" && (
        <form action={retryTriage} className="flex items-center justify-between gap-2">
          <input type="hidden" name="ticketId" value={ticket.id} />
          <span className="text-red-700">Triage failed.</span>
          <button className="text-xs link">Retry</button>
        </form>
      )}
      {ticket.aiSummary && <p className="text-slate-800">{ticket.aiSummary}</p>}
      {ticket.aiSuggestedPriority && (
        <p className="mt-2 text-xs text-slate-600">
          Suggested {ticket.aiSuggestedType ? typeLabels[ticket.aiSuggestedType].toLowerCase() : "ticket"}, priority{" "}
          <strong>{priorityLabels[ticket.aiSuggestedPriority]}</strong>
          {ticket.aiSuggestedPriority !== ticket.priority && ` (kept at ${priorityLabels[ticket.priority]})`}
          {ticket.aiPriorityReason ? ` — ${ticket.aiPriorityReason}` : ""}
        </p>
      )}
    </section>
  );
}

function Header({ name, date, tag, via }: { name: string; date: Date; tag?: string; via?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium">{name}</span>
      {tag && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{tag}</span>}
      <span className="text-slate-500">
        <Time date={date} />
        {via ? ` · via ${via}` : ""}
      </span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function Select({ name, label, value, options }: { name: string; label: string; value: string; options: Record<string, string> }) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <select id={name} name={name} defaultValue={value} className="input">
        {Object.entries(options).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}
