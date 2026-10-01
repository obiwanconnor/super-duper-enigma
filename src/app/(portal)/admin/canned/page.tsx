import Link from "next/link";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { Flash } from "@/components/flash";
import { CannedForm } from "./form";

export const metadata = { title: "Saved replies" };

export default async function CannedPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  await requireStaff();
  const flash = await searchParams;
  const items = await db.cannedResponse.findMany({ orderBy: { title: "asc" }, include: { createdBy: { select: { name: true, email: true } } } });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Saved replies</h1>
      <p className="mb-6 text-sm text-slate-600">Reply templates any staff member can insert when answering a ticket.</p>
      <Flash {...flash} />
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <section aria-labelledby="list-heading">
          <h2 id="list-heading" className="sr-only">
            All saved replies
          </h2>
          {items.length === 0 ? (
            <p className="card p-6 text-sm text-slate-600">No saved replies yet.</p>
          ) : (
            <ul className="card divide-y divide-slate-100">
              {items.map((c) => (
                <li key={c.id} className="px-5 py-4">
                  <Link href={`/admin/canned/${c.id}`} className="font-medium link">
                    {c.title}
                  </Link>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">{c.body}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="new-heading" className="card h-fit p-5">
          <h2 id="new-heading" className="mb-3 font-semibold">
            New saved reply
          </h2>
          <CannedForm />
        </section>
      </div>
    </div>
  );
}
