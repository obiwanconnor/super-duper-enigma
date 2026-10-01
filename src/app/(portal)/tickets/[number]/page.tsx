import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { canViewTicket, commentScope, isStaff } from "@/lib/access";
import { requireViewer } from "@/lib/session";
import { OPEN_STATUSES, priorityLabels, staffStatusLabels, typeLabels } from "@/lib/labels";
import { loadTargets, slaFor } from "@/lib/sla/targets";
import { describeTarget, targetsFor } from "@/lib/sla/sla";
import { fillPlaceholders, firstName } from "@/lib/canned";
import { ratingLabels } from "@/lib/survey";
import { PriorityBadge, StatusBadge } from "@/components/badges";
import { AttachmentList, FileInput } from "@/components/attachments";
import { CannedPicker } from "@/components/canned-picker";
import { Flash } from "@/components/flash";
import { Markdown } from "@/components/markdown";
import { SlaBadge } from "@/components/sla";
import { SubmitButton } from "@/components/submit-button";
import { SurveyForm } from "@/components/survey-form";
import { Time } from "@/components/time";
import {
  addWatcher,
  clientSetStatus,
  discardDraft,
  postComment,
  regenerateDraft,
  removeWatcher,
  retryTriage,
  sendDraft,
  submitTicketSurvey,
  updateTicket,
} from "../actions";

export async function generateMetadata({ params }: { params: Promise<{ number: string }> }) {
  return { title: `Ticket #${(await params).number}` };
}

export default async function TicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ number: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const viewer = await requireViewer();
  const number = Number((await params).number);
  const flash = await searchParams;
  if (!Number.isInteger(number)) notFound();

  const staff = isStaff(viewer);
  const ticket = await db.ticket.findUnique({
    where: { number },
    include: {
      product: true,
      organization: { include: { slaTargets: true } },
      requester: { select: { id: true, name: true, email: true } },
      assignee: { select: { id: true, name: true, email: true } },
      comments: {
        where: commentScope(viewer),
        orderBy: { createdAt: "asc" },
        include: { author: { select: { name: true, email: true, role: true } } },
      },
      attachments: { orderBy: { createdAt: "asc" }, select: { id: true, filename: true, contentType: true, size: true, commentId: true } },
      watchers: { include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "asc" } },
      satisfaction: true,
      // AI drafts are for staff eyes only; never load them for clients.
      drafts: staff ? { where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 1 } : false,
    },
  });
  if (!ticket || !canViewTicket(viewer, ticket)) notFound();

  const draft = ticket.drafts?.[0];
  const [agents, targets, articles, canned, colleagues] = await Promise.all([
    staff
      ? db.user.findMany({ where: { role: { in: ["AGENT", "ADMIN"] }, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true } })
      : [],
    staff ? loadTargets([ticket.organizationId]) : new Map(),
    staff && draft ? db.article.findMany({ where: { slug: { in: draft.kbArticleSlugs } }, select: { slug: true, title: true } }) : [],
    staff ? db.cannedResponse.findMany({ orderBy: { title: "asc" }, select: { id: true, title: true, body: true } }) : [],
    db.user.findMany({
      where: { organizationId: ticket.organizationId, role: "CLIENT", active: true, id: { notIn: [ticket.requesterId, ...ticket.watchers.map((w) => w.userId)] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
  ]);

  const sla = staff ? slaFor(ticket, targets) : null;
  const clientTargets = targetsFor(ticket.priority, ticket.organization.slaTargets);
  const isOpen = OPEN_STATUSES.includes(ticket.status);
  const attachmentsFor = (commentId: string | null) => ticket.attachments.filter((a) => a.commentId === commentId);
  const cannedFilled = canned.map((c) => ({
    ...c,
    body: fillPlaceholders(c.body, {
      requester_first_name: firstName(ticket.requester.name),
      client_name: ticket.organization.name,
      ticket_number: String(ticket.number),
      agent_name: viewer.name ?? "",
    }),
  }));
  const statusOptions = Object.entries(staffStatusLabels);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0">
        <Link href="/tickets" className="text-sm link">
          <span aria-hidden="true">← </span>All tickets
        </Link>
        <div className="mt-2 mb-6">
          <h1 className="text-2xl font-semibold break-words">{ticket.subject}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span>Ticket #{ticket.number}</span>
            <StatusBadge status={ticket.status} staff={staff} />
            <PriorityBadge priority={ticket.priority} />
            {staff && ticket.aiLikelyIncident && (
              <span className="rounded-full bg-red-700 px-2 py-0.5 text-xs font-semibold text-white">Possible incident</span>
            )}
          </div>
        </div>

        <Flash {...flash} />

        {staff && <AiPanel ticket={ticket} />}

        <h2 className="sr-only">Conversation</h2>
        <ol className="space-y-4">
          <li className="card p-5">
            <MessageHeader name={ticket.requester.name ?? ticket.requester.email} date={ticket.createdAt} />
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
                className={`card p-5 ${c.internal ? "border-amber-300 bg-amber-50" : role === "AI" ? "border-violet-300 bg-violet-50" : role !== "CLIENT" ? "border-brand-100" : ""}`}
              >
                <MessageHeader name={c.author.name ?? c.author.email} date={c.createdAt} tag={tag} via={c.source === "EMAIL" ? "email" : undefined} />
                <div className="mt-3 text-sm">
                  <Markdown>{c.body}</Markdown>
                </div>
                <AttachmentList attachments={attachmentsFor(c.id)} />
              </li>
            );
          })}
        </ol>

        {staff && draft && (
          <section aria-labelledby="draft-heading" className="card mt-6 border-violet-300 p-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 id="draft-heading" className="font-semibold">
                Suggested reply
              </h2>
              <span className="text-xs text-slate-600">
                AI draft · {draft.confidence} confidence · <Time date={draft.createdAt} />
              </span>
            </div>
            {articles.length > 0 && (
              <p className="mb-2 text-xs text-slate-700">
                Based on:{" "}
                {articles.map((a, i) => (
                  <span key={a.slug}>
                    {i > 0 && ", "}
                    <Link href={`/kb/${a.slug}`} className="link">
                      {a.title}
                    </Link>
                  </span>
                ))}
              </p>
            )}
            <form action={sendDraft} className="space-y-3">
              <input type="hidden" name="draftId" value={draft.id} />
              <label htmlFor="draft-body" className="sr-only">
                Suggested reply text
              </label>
              <textarea id="draft-body" name="body" rows={8} defaultValue={draft.body} className="input" />
              <CannedPicker items={cannedFilled} targetId="draft-body" />
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <label htmlFor="draft-status" className="label">
                    Set status
                  </label>
                  <select id="draft-status" name="setStatus" defaultValue="" className="input w-auto py-1">
                    <option value="">(unchanged)</option>
                    {statusOptions.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
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

        <section aria-labelledby="reply-heading" className="card mt-6 p-5">
          <h2 id="reply-heading" className="mb-3 font-semibold">
            {isOpen ? "Add a reply" : "Reply to reopen this ticket"}
          </h2>
          <form action={postComment} className="space-y-3">
            <input type="hidden" name="ticketId" value={ticket.id} />
            <div>
              <label htmlFor="reply-body" className="label">
                Message
              </label>
              <textarea id="reply-body" name="body" rows={5} className="input" aria-describedby="reply-hint" />
              <p id="reply-hint" className="mt-1 text-xs text-slate-600">
                You can use Markdown for formatting.
              </p>
            </div>
            {staff && <CannedPicker items={cannedFilled} targetId="reply-body" />}
            <FileInput id="reply-files" />
            <div className="flex flex-wrap items-end justify-between gap-3">
              {staff ? (
                <div className="flex flex-wrap items-end gap-4 text-sm">
                  <label className="flex min-h-6 items-center gap-2">
                    <input type="checkbox" name="internal" /> Internal note (staff only)
                  </label>
                  <div>
                    <label htmlFor="reply-status" className="label">
                      Set status
                    </label>
                    <select id="reply-status" name="setStatus" defaultValue="" className="input w-auto py-1">
                      <option value="">(unchanged)</option>
                      {statusOptions.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <span />
              )}
              <SubmitButton pendingText="Sending…">Send</SubmitButton>
            </div>
          </form>
        </section>
      </div>

      <aside aria-label="Ticket details" className="space-y-4">
        {sla ? (
          <section aria-labelledby="sla-heading" className="card space-y-3 p-5 text-sm">
            <h2 id="sla-heading" className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              SLA (business hours)
            </h2>
            <div className="flex items-center justify-between gap-2">
              <span>First response</span>
              <SlaBadge clock={sla.firstResponse} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>Resolution</span>
              <SlaBadge clock={sla.resolution} />
            </div>
          </section>
        ) : (
          <section aria-labelledby="targets-heading" className="card p-5 text-sm">
            <h2 id="targets-heading" className="mb-2 font-semibold">
              Our service targets
            </h2>
            <p>
              For {priorityLabels[ticket.priority].toLowerCase()} priority tickets we aim to respond within{" "}
              <strong>{describeTarget(clientTargets.firstResponseMinutes)}</strong> and resolve within{" "}
              <strong>{describeTarget(clientTargets.resolutionMinutes)}</strong>.
            </p>
            <p className="mt-2 text-xs text-slate-600">Business hours are Monday to Friday, 9am to 5pm UK time, excluding bank holidays.</p>
          </section>
        )}

        <section aria-labelledby="details-heading" className="card p-5 text-sm">
          <h2 id="details-heading" className="sr-only">
            Details
          </h2>
          <dl className="space-y-3">
            <Field label="Client">{ticket.organization.name}</Field>
            <Field label="Product">{ticket.product.name}</Field>
            <Field label="Type">{typeLabels[ticket.type]}</Field>
            <Field label="Raised by">{ticket.requester.name ?? ticket.requester.email}</Field>
            <Field label="Created">
              <Time date={ticket.createdAt} />
            </Field>
            {!staff && <Field label="Assigned to">{ticket.assignee ? (ticket.assignee.name ?? ticket.assignee.email) : "Not yet assigned"}</Field>}
          </dl>
        </section>

        <section aria-labelledby="cc-heading" className="card p-5 text-sm">
          <h2 id="cc-heading" className="mb-2 font-semibold">
            Colleagues copied in
          </h2>
          {ticket.watchers.length === 0 ? (
            <p className="text-slate-600">No one else is copied in.</p>
          ) : (
            <ul className="mb-3 space-y-2">
              {ticket.watchers.map((w) => (
                <li key={w.userId} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 break-words">{w.user.name ?? w.user.email}</span>
                  <form action={removeWatcher}>
                    <input type="hidden" name="ticketId" value={ticket.id} />
                    <input type="hidden" name="userId" value={w.userId} />
                    <button className="btn-link" aria-label={`Remove ${w.user.name ?? w.user.email}`}>
                      Remove
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          {colleagues.length > 0 && (
            <form action={addWatcher} className="mt-3 space-y-2">
              <input type="hidden" name="ticketId" value={ticket.id} />
              <label htmlFor="cc-user" className="label">
                Copy in a colleague
              </label>
              <select id="cc-user" name="userId" required defaultValue="" className="input">
                <option value="" disabled>
                  Choose a person…
                </option>
                {colleagues.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name ? `${c.name} (${c.email})` : c.email}
                  </option>
                ))}
              </select>
              <SubmitButton className="btn-secondary w-full">Copy in</SubmitButton>
            </form>
          )}
        </section>

        {!staff && !isOpen && (
          <section aria-labelledby="feedback-heading" className="card p-5 text-sm">
            <h2 id="feedback-heading" className="mb-2 font-semibold">
              Your feedback
            </h2>
            {ticket.satisfaction && (
              <p className="mb-3 text-slate-700">Rated {ratingLabels[ticket.satisfaction.rating].toLowerCase()}. You can change the rating.</p>
            )}
            <SurveyForm
              action={submitTicketSurvey}
              hidden={{ ticketId: ticket.id }}
              legend="How would you rate the support you received?"
              selected={ticket.satisfaction?.rating}
              comment={ticket.satisfaction?.comment}
            />
          </section>
        )}

        {staff ? (
          <>
            <section aria-labelledby="update-heading" className="card p-5">
              <h2 id="update-heading" className="mb-3 font-semibold">
                Update ticket
              </h2>
              <form action={updateTicket} className="space-y-3">
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
                  Save changes
                </SubmitButton>
              </form>
            </section>
            {ticket.satisfaction && (
              <section aria-labelledby="csat-heading" className="card p-5 text-sm">
                <h2 id="csat-heading" className="mb-1 font-semibold">
                  Client feedback
                </h2>
                <p>Rated {ratingLabels[ticket.satisfaction.rating].toLowerCase()}</p>
                {ticket.satisfaction.comment && <p className="mt-1 text-slate-700">&ldquo;{ticket.satisfaction.comment}&rdquo;</p>}
              </section>
            )}
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
          isOpen && (
            <form action={clientSetStatus} className="card p-5">
              <input type="hidden" name="ticketId" value={ticket.id} />
              <SubmitButton className="btn-secondary w-full" name="status" value="RESOLVED">
                Mark as resolved
              </SubmitButton>
            </form>
          )
        )}
        {!staff && !isOpen && (
          <form action={clientSetStatus} className="card p-5">
            <input type="hidden" name="ticketId" value={ticket.id} />
            <SubmitButton className="btn-secondary w-full" name="status" value="OPEN">
              Reopen ticket
            </SubmitButton>
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
};

function AiPanel({ ticket }: { ticket: AiTicket }) {
  if (ticket.aiStatus === "SKIPPED" && !ticket.aiSummary) return null;
  return (
    <section aria-labelledby="ai-heading" className="mb-6 rounded-lg border border-violet-300 bg-violet-50 p-4 text-sm">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 id="ai-heading" className="font-semibold text-violet-900">
          AI triage
        </h2>
        {(ticket.aiStatus === "PENDING" || ticket.aiStatus === "RUNNING") && (
          <span role="status" className="text-xs text-violet-900">
            Working…
          </span>
        )}
      </div>
      {ticket.aiStatus === "FAILED" && (
        <form action={retryTriage} className="flex items-center justify-between gap-2">
          <input type="hidden" name="ticketId" value={ticket.id} />
          <span className="text-red-800">Triage failed.</span>
          <button className="btn-link">Retry triage</button>
        </form>
      )}
      {ticket.aiSummary && <p className="text-slate-800">{ticket.aiSummary}</p>}
      {ticket.aiSuggestedPriority && (
        <p className="mt-2 text-xs text-slate-700">
          Suggested {ticket.aiSuggestedType ? typeLabels[ticket.aiSuggestedType].toLowerCase() : "ticket"}, priority{" "}
          <strong>{priorityLabels[ticket.aiSuggestedPriority]}</strong>
          {ticket.aiSuggestedPriority !== ticket.priority && ` (kept at ${priorityLabels[ticket.priority]})`}
          {ticket.aiPriorityReason ? ` — ${ticket.aiPriorityReason}` : ""}
        </p>
      )}
    </section>
  );
}

function MessageHeader({ name, date, tag, via }: { name: string; date: Date; tag?: string; via?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium">{name}</span>
      {tag && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{tag}</span>}
      <span className="text-slate-600">
        <Time date={date} />
        {via ? ` · via ${via}` : ""}
      </span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-600">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
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
