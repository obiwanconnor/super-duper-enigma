import Link from "next/link";
import { db } from "@/lib/db";
import { isStaff, productScope } from "@/lib/access";
import { requireViewer } from "@/lib/session";
import { priorityLabels, typeLabels } from "@/lib/labels";
import { SubmitButton } from "@/components/submit-button";
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

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-semibold">New ticket</h1>
      <p className="mb-6 text-sm text-slate-500">
        Before raising a ticket, it may be worth checking the{" "}
        <Link href="/kb" className="link">
          knowledge base
        </Link>
        .
      </p>

      {error && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

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
                {isStaff(viewer) ? `${p.organization.name} – ${p.name}` : p.name}
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
            <select id="priority" name="priority" defaultValue="NORMAL" className="input">
              {Object.entries(priorityLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">Use Urgent only when the system is down or unusable.</p>
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
