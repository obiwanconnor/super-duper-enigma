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
              <img src={`/api/attachments/${a.id}`} alt={a.filename} className="h-28 max-w-60 rounded border border-slate-200 object-cover" />
            </a>
          ))}
        </div>
      )}
      <ul className="flex flex-wrap gap-2 text-xs">
        {attachments.map((a) => (
          <li key={a.id}>
            <a href={`/api/attachments/${a.id}`} className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 hover:bg-slate-100">
              📎 {a.filename} <span className="text-slate-500">({formatBytes(a.size)})</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FileInput() {
  return (
    <div>
      <input
        type="file"
        name="files"
        multiple
        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-slate-50"
      />
      <p className="mt-1 text-xs text-slate-500">Screenshots, logs or documents · up to 5 files, 4 MB in total.</p>
    </div>
  );
}
