import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

/**
 * Renders Markdown safely: raw HTML in the source is not rendered.
 * `preserveBreaks` keeps single line breaks, which suits ticket comments
 * (often plain text from email) but not authored articles.
 */
export function Markdown({ children, preserveBreaks = true }: { children: string; preserveBreaks?: boolean }) {
  return (
    <div className="prose-kb break-words">
      <ReactMarkdown remarkPlugins={preserveBreaks ? [remarkGfm, remarkBreaks] : [remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
