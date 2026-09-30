import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { articleScope, isStaff, productScope } from "@/lib/access";
import { requireViewer } from "@/lib/session";

export const metadata = { title: "Knowledge base" };

export default async function KnowledgeBasePage({ searchParams }: { searchParams: Promise<{ q?: string; product?: string }> }) {
  const viewer = await requireViewer();
  const { q, product } = await searchParams;

  const filters: Prisma.ArticleWhereInput[] = [articleScope(viewer), { published: true }];
  if (product) filters.push({ productId: product });
  if (q?.trim()) {
    filters.push({
      OR: [{ title: { contains: q.trim(), mode: "insensitive" } }, { body: { contains: q.trim(), mode: "insensitive" } }],
    });
  }

  const [articles, products] = await Promise.all([
    db.article.findMany({
      where: { AND: filters },
      orderBy: [{ product: { name: "asc" } }, { title: "asc" }],
      select: { slug: true, title: true, body: true, updatedAt: true, product: { select: { id: true, name: true, organization: { select: { name: true } } } } },
      take: 200,
    }),
    db.product.findMany({ where: productScope(viewer), orderBy: { name: "asc" }, select: { id: true, name: true, organization: { select: { name: true } } } }),
  ]);

  const staff = isStaff(viewer);
  const productLabel = (p: { name: string; organization: { name: string } }) => (staff ? `${p.organization.name} – ${p.name}` : p.name);

  const grouped = new Map<string, { label: string; items: typeof articles }>();
  for (const a of articles) {
    const g = grouped.get(a.product.id) ?? { label: productLabel(a.product), items: [] };
    g.items.push(a);
    grouped.set(a.product.id, g);
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Knowledge base</h1>
        {staff && (
          <Link href="/admin/articles/new" className="btn-primary">
            New article
          </Link>
        )}
      </div>

      <form method="get" className="mb-6 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Search articles" className="input max-w-sm" />
        {products.length > 1 && (
          <select name="product" defaultValue={product ?? ""} className="input w-auto">
            <option value="">All products</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {productLabel(p)}
              </option>
            ))}
          </select>
        )}
        <button className="btn-secondary">Search</button>
      </form>

      {articles.length === 0 ? (
        <div className="card p-10 text-center text-sm text-slate-500">
          {q ? "No articles match your search." : "There are no articles yet."}{" "}
          <Link href="/tickets/new" className="link">
            Raise a ticket
          </Link>{" "}
          and we'll help.
        </div>
      ) : (
        <div className="space-y-8">
          {[...grouped.values()].map((g) => (
            <section key={g.label}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{g.label}</h2>
              <ul className="card divide-y divide-slate-100">
                {g.items.map((a) => (
                  <li key={a.slug}>
                    <Link href={`/kb/${a.slug}`} className="block px-5 py-4 hover:bg-slate-50">
                      <div className="font-medium text-slate-900">{a.title}</div>
                      <div className="mt-1 line-clamp-2 text-sm text-slate-500">{excerpt(a.body)}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function excerpt(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[#>*_`\[\]]/g, "")
    .replace(/\(([^)]*)\)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}
