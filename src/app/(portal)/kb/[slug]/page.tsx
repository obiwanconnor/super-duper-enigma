import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { articleScope, isStaff } from "@/lib/access";
import { requireViewer } from "@/lib/session";
import { Markdown } from "@/components/markdown";
import { Time } from "@/components/time";

async function loadArticle(slug: string) {
  const viewer = await requireViewer();
  const article = await db.article.findFirst({
    where: { AND: [{ slug }, articleScope(viewer)] },
    include: { product: { select: { id: true, name: true } } },
  });
  return { viewer, article };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { article } = await loadArticle((await params).slug);
  return { title: article?.title ?? "Article" };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { viewer, article } = await loadArticle((await params).slug);
  if (!article) notFound();

  return (
    <article className="mx-auto max-w-3xl">
      <Link href="/kb" className="text-sm link">
        ← Knowledge base
      </Link>
      <div className="mt-2 mb-6">
        <div className="text-sm text-slate-500">
          {article.product.name} · Updated <Time date={article.updatedAt} />
          {!article.published && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">Draft</span>}
        </div>
        <h1 className="mt-1 text-3xl font-semibold">{article.title}</h1>
        {isStaff(viewer) && (
          <Link href={`/admin/articles/${article.id}`} className="mt-2 inline-block text-sm link">
            Edit article
          </Link>
        )}
      </div>
      <div className="card p-6 sm:p-8">
        <Markdown preserveBreaks={false}>{article.body}</Markdown>
      </div>
      <div className="mt-6 rounded-lg bg-slate-100 p-5 text-sm text-slate-700">
        Didn't answer your question?{" "}
        <Link href={`/tickets/new?product=${article.product.id}`} className="link">
          Raise a ticket
        </Link>
        .
      </div>
    </article>
  );
}
