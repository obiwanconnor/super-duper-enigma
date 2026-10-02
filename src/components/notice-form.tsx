import { SubmitButton } from "./submit-button";
import { toLondonInput } from "@/lib/notices";

type Product = { id: string; name: string; organization: { name: string } };
type Notice = { id: string; kind: "INCIDENT" | "MAINTENANCE"; title: string; body: string; startsAt: Date; endsAt: Date | null };

export function NoticeForm({
  action,
  products,
  notice,
}: {
  action: (formData: FormData) => Promise<void>;
  products?: Product[];
  notice?: Notice;
}) {
  return (
    <form action={action} className="card space-y-5 p-6">
      {notice && <input type="hidden" name="id" value={notice.id} />}
      <fieldset>
        <legend className="label">Type of notice</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex min-h-6 items-center gap-2">
            <input type="radio" name="kind" value="INCIDENT" defaultChecked={(notice?.kind ?? "INCIDENT") === "INCIDENT"} required /> Incident (something is broken)
          </label>
          <label className="flex min-h-6 items-center gap-2">
            <input type="radio" name="kind" value="MAINTENANCE" defaultChecked={notice?.kind === "MAINTENANCE"} /> Planned maintenance
          </label>
        </div>
      </fieldset>
      <div>
        <label htmlFor="notice-title" className="label">
          Title
        </label>
        <input id="notice-title" name="title" required maxLength={160} defaultValue={notice?.title} className="input" />
      </div>
      <div>
        <label htmlFor="notice-body" className="label">
          What clients need to know
        </label>
        <textarea id="notice-body" name="body" required rows={6} defaultValue={notice?.body} className="input" aria-describedby="notice-body-hint" />
        <p id="notice-body-hint" className="mt-1 text-xs text-slate-600">
          Describe the impact in plain language, any workaround, and when the next update will be.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="notice-start" className="label">
            Starts (UK time)
          </label>
          <input
            id="notice-start"
            name="startsAt"
            type="datetime-local"
            defaultValue={notice ? toLondonInput(notice.startsAt) : ""}
            className="input"
            aria-describedby="notice-start-hint"
          />
          <p id="notice-start-hint" className="mt-1 text-xs text-slate-600">
            Leave blank for now.
          </p>
        </div>
        <div>
          <label htmlFor="notice-end" className="label">
            Expected end (UK time, optional)
          </label>
          <input id="notice-end" name="endsAt" type="datetime-local" defaultValue={notice?.endsAt ? toLondonInput(notice.endsAt) : ""} className="input" />
        </div>
      </div>
      {products && (
        <fieldset>
          <legend className="label">Affected products</legend>
          <div className="max-h-60 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-3 text-sm">
            {products.map((p) => (
              <label key={p.id} className="flex min-h-6 items-center gap-2">
                <input type="checkbox" name="productIds" value={p.id} />
                {p.organization.name} – {p.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <label className="flex min-h-6 items-center gap-2 text-sm">
        <input type="checkbox" name="email" defaultChecked={!notice} />
        Email everyone at the affected clients
      </label>
      <SubmitButton pendingText="Saving…">{notice ? "Save update" : "Publish notice"}</SubmitButton>
    </form>
  );
}
