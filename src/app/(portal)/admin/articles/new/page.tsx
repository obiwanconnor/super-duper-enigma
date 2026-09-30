import Link from "next/link";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { ArticleForm } from "@/components/article-form";
import { Flash } from "@/components/flash";

export const metadata = { title: "New article" };

export default async function NewArticlePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireStaff();
  const { error } = await searchParams;
  const products = await db.product.findMany({
    orderBy: [{ organization: { name: "asc" } }, { name: "asc" }],
    select: { id: true, name: true, organization: { select: { name: true } } },
  });

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/articles" className="text-sm link">
        ← Articles
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">New article</h1>
      <Flash error={error} />
      <ArticleForm products={products} />
    </div>
  );
}
