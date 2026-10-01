import Link from "next/link";
import { db } from "@/lib/db";
import { isStaff, productScope } from "@/lib/access";
import { requireViewer } from "@/lib/session";
import { priorityLabels, typeLabels } from "@/lib/labels";
import { SubmitButton } from "@/components/submit-button";
import { FileInput } from "@/components/attachments";
import { Flash } from "@/components/flash";
import { describeTarget, PRIORITIES, targetsFor } from "@/lib/sla/sla";
import { createTicket } from "../actions";

export const metadata = { title: "New ticket" };

export default async function NewTicketPage({ searchParams }: { searchParams: Promise<{ error?: string; product?: string }> }) {
  const viewer = await requireViewer();
  const { error, product } = await searchParams;
  const products = await db.product.findMany({
    where: productScope(viewer),
    orderBy: [{ organization: { name: "asc" } }, { name: "asc" }],
    select: { id: true, name: true, organization: { select: { name: true } } },
  });
  const staff = isStaff(viewer);
  const [colleagues, slaTargets] = staff || !viewer.organizationId
    ? [[], []]
    : await Promise.all([
        db.user.findMany({
          where: { organizationId: viewer.organizationId, role: "CLIENT", active: true, id: { not: viewer.id } },
          orderBy: { name: "asc" },
          select: { id: true, name: true, email: true },
        }),
        db.slaTarget.findMany({ where: { organizationId: viewer.organizationId } }),
      ]);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-semibold">New ticket</h1>
      <p className="mb-6 text-sm text-slate-600">
        Before raising a ticket, it may be worth checking the{" "}
        <Link href="/kb" className="link">
          knowledge base
        </Link>
        .
      </p>

      <Flash error={error} />

      <form action={createTicket} className="card space-y-5 p-6">
        <div>
          <label htmlFor="productId" className="label">
            Product
          </label>
          <select id="productId" name="productId" required defaultValue={product ?? (products.length === 1 ? products[0].id : "")} className="input">
            <option value="" disabled>
              Select a product…
            </option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {staff ? `${p.organization.name} – ${p.name}` : p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="type" className="label">
              Type
            </label>
            <select id="type" name="type" defaultValue="QUESTION" className="input">
              {Object.entries(typeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="priority" className="label">
              Priority
            </label>
            <select id="priority" name="priority" defaultValue="NORMAL" className="input" aria-describedby="priority-hint">
              {Object.entries(priorityLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <p id="priority-hint" className="mt-1 text-xs text-slate-600">
              Use Urgent only when the system is down or unusable.
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="subject" className="label">
            Summary
          </label>
          <input id="subject" name="subject" required minLength={3} maxLength={200} className="input" placeholder="e.g. Invoices page fails to load" />
        </div>

        <div>
          <label htmlFor="description" className="label">
            Details
          </label>
          <textarea
            id="description"
            name="description"
            required
            minLength={10}
            rows={8}
            className="input"
            placeholder={"What happened? What did you expect to happen?\nSteps to reproduce, affected users, links, error messages…"}
          />
        </div>

        <FileInput id="new-files" />

        {!staff && (
          <details className="rounded-md border border-slate-200 p-3 text-sm">
            <summary className="cursor-pointer font-medium">Our response targets by priority</summary>
            <table className="mt-2 w-full">
              <caption className="sr-only">Response and resolution targets</caption>
              <thead className="text-left text-xs text-slate-600">
                <tr>
                  <th scope="col" className="py-1 pr-2 font-medium">Priority</th>
                  <th scope="col" className="py-1 pr-2 font-medium">First response</th>
                  <th scope="col" className="py-1 font-medium">Resolution</th>
                </tr>
              </thead>
              <tbody>
                {PRIORITIES.map((p) => {
                  const t = targetsFor(p, slaTargets);
                  return (
                    <tr key={p}>
                      <th scope="row" className="py-1 pr-2 text-left font-normal">{priorityLabels[p]}</th>
                      <td className="py-1 pr-2">{describeTarget(t.firstResponseMinutes)}</td>
                      <td className="py-1">{describeTarget(t.resolutionMinutes)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-600">Business hours are Monday to Friday, 9am to 5pm UK time, excluding bank holidays.</p>
          </details>
        )}

        {colleagues.length > 0 && (
          <fieldset aria-describedby="cc-hint">
            <legend className="label">Copy in colleagues (optional)</legend>
            <p id="cc-hint" className="mb-2 text-xs text-slate-600">
              They&apos;ll get the same email updates as you and can reply.
            </p>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-3">
              {colleagues.map((c) => (
                <label key={c.id} className="flex min-h-6 items-center gap-2 text-sm">
                  <input type="checkbox" name="watchers" value={c.id} />
                  {c.name ? `${c.name} (${c.email})` : c.email}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="flex justify-end gap-2">
          <Link href="/tickets" className="btn-secondary">
            Cancel
          </Link>
          <SubmitButton pendingText="Submitting…">Submit ticket</SubmitButton>
        </div>
      </form>
    </div>
  );
}
