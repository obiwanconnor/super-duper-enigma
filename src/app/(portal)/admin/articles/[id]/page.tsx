import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { ArticleForm } from "@/components/article-form";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { deleteArticle } from "../../actions";

export const metadata = { title: "Edit article" };

export default async function EditArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  await requireStaff();
  const { id } = await params;
  const flash = await searchParams;
  const [article, products] = await Promise.all([
    db.article.findUnique({ where: { id } }),
    db.product.findMany({
      orderBy: [{ organization: { name: "asc" } }, { name: "asc" }],
      select: { id: true, name: true, organization: { select: { name: true } } },
    }),
  ]);
  if (!article) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <Link href="/admin/articles" className="text-sm link">
          ← Articles
        </Link>
        <Link href={`/kb/${article.slug}`} className="text-sm link">
          View
        </Link>
      </div>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">Edit article</h1>
      <Flash {...flash} />
      <ArticleForm products={products} article={article} />
      <form action={deleteArticle} className="mt-4 text-right">
        <input type="hidden" name="id" value={article.id} />
        <SubmitButton className="btn-danger" pendingText="Deleting…">
          Delete article
        </SubmitButton>
      </form>
    </div>
  );
}
