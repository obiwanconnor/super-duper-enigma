import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { canViewTicket, commentScope, isStaff } from "@/lib/access";
import { requireViewer } from "@/lib/session";
import { OPEN_STATUSES, priorityLabels, staffStatusLabels, typeLabels } from "@/lib/labels";
import { PriorityBadge, StatusBadge } from "@/components/badges";
import { Markdown } from "@/components/markdown";
import { SubmitButton } from "@/components/submit-button";
import { Time } from "@/components/time";
import { clientSetStatus, postComment, updateTicket } from "../actions";

export async function generateMetadata({ params }: { params: Promise<{ number: string }> }) {
  return { title: `Ticket #${(await params).number}` };
}

export default async function TicketPage({ params }: { params: Promise<{ number: string }> }) {
  const viewer = await requireViewer();
  const number = Number((await params).number);
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
    },
  });
  if (!ticket || !canViewTicket(viewer, ticket)) notFound();

  const staff = isStaff(viewer);
  const agents = staff
    ? await db.user.findMany({ where: { role: { in: ["AGENT", "ADMIN"] }, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true } })
    : [];
  const isOpen = OPEN_STATUSES.includes(ticket.status);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
      <div className="min-w-0">
        <Link href="/tickets" className="text-sm link">
          ← All tickets
        </Link>
        <div className="mt-2 mb-6">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span>#{ticket.number}</span>
            <StatusBadge status={ticket.status} staff={staff} />
            <PriorityBadge priority={ticket.priority} />
          </div>
          <h1 className="mt-2 text-2xl font-semibold break-words">{ticket.subject}</h1>
        </div>

        <ol className="space-y-4">
          <li className="card p-5">
            <Header name={ticket.requester.name ?? ticket.requester.email} date={ticket.createdAt} />
            <div className="mt-3 text-sm break-words">
              <Markdown>{ticket.description}</Markdown>
            </div>
          </li>
          {ticket.comments.map((c) => {
            const fromStaff = c.author.role !== "CLIENT";
            return (
              <li
                key={c.id}
                id={`comment-${c.id}`}
                className={`card p-5 ${c.internal ? "border-amber-200 bg-amber-50" : fromStaff ? "border-brand-100" : ""}`}
              >
                <Header
                  name={c.author.name ?? c.author.email}
                  date={c.createdAt}
                  tag={c.internal ? "Internal note" : fromStaff && !staff ? "Support team" : undefined}
                  via={c.source === "EMAIL" ? "email" : undefined}
                />
                <div className="mt-3 text-sm">
                  <Markdown>{c.body}</Markdown>
                </div>
              </li>
            );
          })}
        </ol>

        <form action={postComment} className="card mt-6 space-y-3 p-5">
          <input type="hidden" name="ticketId" value={ticket.id} />
          <label htmlFor="body" className="label">
            {isOpen ? "Add a reply" : "Reply to reopen this ticket"}
          </label>
          <textarea id="body" name="body" rows={5} required className="input" placeholder="Markdown supported" />
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
