import Link from "next/link";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { Time } from "@/components/time";

export const metadata = { title: "Articles" };

export default async function ArticlesAdminPage() {
  await requireStaff();
  const articles = await db.article.findMany({
    orderBy: { updatedAt: "desc" },
    include: { product: { select: { name: true, organization: { select: { name: true } } } }, author: { select: { name: true, email: true } } },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Articles</h1>
        <Link href="/admin/articles/new" className="btn-primary">
          New article
        </Link>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th scope="col" className="px-4 py-3">Title</th>
              <th scope="col" className="px-4 py-3">Product</th>
              <th scope="col" className="px-4 py-3">Status</th>
              <th scope="col" className="px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {articles.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-600">
                  No articles yet.
                </td>
              </tr>
            )}
            {articles.map((a) => (
              <tr key={a.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/admin/articles/${a.id}`} className="font-medium hover:text-brand-700">
                    {a.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {a.product.organization.name} – {a.product.name}
                </td>
                <td className="px-4 py-3">
                  {a.published ? <span className="text-emerald-700">Published</span> : <span className="text-amber-700">Draft</span>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                  <Time date={a.updatedAt} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
