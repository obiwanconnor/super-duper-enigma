import { SubmitButton } from "@/components/submit-button";
import { PLACEHOLDERS } from "@/lib/canned";
import { saveCannedResponse } from "../actions";

export function CannedForm({ item }: { item?: { id: string; title: string; body: string } }) {
  const prefix = item ? `edit-${item.id}` : "new";
  return (
    <form action={saveCannedResponse} className="space-y-4">
      {item && <input type="hidden" name="id" value={item.id} />}
      <div>
        <label htmlFor={`${prefix}-title`} className="label">
          Title
        </label>
        <input id={`${prefix}-title`} name="title" required defaultValue={item?.title} className="input" />
      </div>
      <div>
        <label htmlFor={`${prefix}-body`} className="label">
          Reply text
        </label>
        <textarea id={`${prefix}-body`} name="body" required rows={10} defaultValue={item?.body} className="input" aria-describedby={`${prefix}-hint`} />
        <div id={`${prefix}-hint`} className="mt-1 text-xs text-slate-600">
          Markdown supported. Placeholders filled in when inserted:{" "}
          {PLACEHOLDERS.map((p, i) => (
            <span key={p.key}>
              {i > 0 && ", "}
              <code>{`{{${p.key}}}`}</code> ({p.description})
            </span>
          ))}
          .
        </div>
      </div>
      <SubmitButton pendingText="Saving…">Save</SubmitButton>
    </form>
  );
}
