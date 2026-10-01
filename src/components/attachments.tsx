import { formatBytes, INLINE_IMAGE_TYPES } from "@/lib/attachments";

type Attachment = { id: string; filename: string; contentType: string; size: number };

export function AttachmentList({ attachments }: { attachments: Attachment[] }) {
  if (attachments.length === 0) return null;
  const images = attachments.filter((a) => INLINE_IMAGE_TYPES.includes(a.contentType));
  return (
    <div className="mt-4 space-y-3">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {images.map((a) => (
            <a key={a.id} href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/attachments/${a.id}`} alt={`Open full-size image: ${a.filename}`} className="h-28 max-w-60 rounded border border-slate-200 object-cover" />
            </a>
          ))}
        </div>
      )}
      <ul aria-label="Attachments" className="flex flex-wrap gap-2 text-xs">
        {attachments.map((a) => (
          <li key={a.id}>
            <a href={`/api/attachments/${a.id}`} className="inline-flex min-h-6 items-center gap-1 rounded border border-slate-300 bg-slate-50 px-2 py-1 text-slate-800 hover:bg-slate-100">
              <span aria-hidden="true">📎</span> {a.filename} <span className="text-slate-600">({formatBytes(a.size)})</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FileInput({ id, label = "Attachments (optional)" }: { id: string; label?: string }) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input
        id={id}
        type="file"
        name="files"
        multiple
        aria-describedby={`${id}-hint`}
        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border file:border-slate-400 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-800 hover:file:bg-slate-50"
      />
      <p id={`${id}-hint`} className="mt-1 text-xs text-slate-600">
        Screenshots, logs or documents. Up to 5 files, 4 MB in total.
      </p>
    </div>
  );
}
