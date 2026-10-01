import { SubmitButton } from "./submit-button";
import { saveArticle } from "@/app/(portal)/admin/actions";

type Props = {
  products: { id: string; name: string; organization: { name: string } }[];
  article?: { id: string; title: string; body: string; productId: string; published: boolean };
};

export function ArticleForm({ products, article }: Props) {
  return (
    <form action={saveArticle} className="card space-y-4 p-6">
      {article && <input type="hidden" name="id" value={article.id} />}
      <div>
        <label className="label" htmlFor="title">
          Title
        </label>
        <input id="title" name="title" required defaultValue={article?.title} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="productId">
          Product
        </label>
        <select id="productId" name="productId" required defaultValue={article?.productId ?? ""} className="input">
          <option value="" disabled>
            Select a product…
          </option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.organization.name} – {p.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-600">Only people at this product's client organisation can read the article.</p>
      </div>
      <div>
        <label className="label" htmlFor="body">
          Content (Markdown)
        </label>
        <textarea id="body" name="body" required rows={20} defaultValue={article?.body} className="input font-mono text-sm" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="published" defaultChecked={article?.published ?? false} /> Published
      </label>
      <SubmitButton pendingText="Saving…">Save article</SubmitButton>
    </form>
  );
}
