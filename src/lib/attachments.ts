import { db } from "./db";
import { storeFile } from "./storage";

/**
 * Vercel functions accept request bodies up to 4.5 MB, so web uploads are
 * capped at 4 MB per submission.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_FILES = 5;

/** Image types we are willing to display inline. Everything else downloads. */
export const INLINE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export function sanitiseFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[^\w.\- ()]+/g, "_").replace(/^\.+/, "").slice(0, 120);
  return cleaned || "file";
}

export type IncomingFile = { filename: string; contentType: string; data: Buffer };

/** Picks real uploads out of a form submission (empty file inputs submit a 0-byte file). */
export async function filesFromForm(formData: FormData, field = "files"): Promise<IncomingFile[]> {
  const files = formData.getAll(field).filter((f): f is File => typeof f !== "string" && f.size > 0);
  return Promise.all(
    files.map(async (f) => ({
      filename: sanitiseFilename(f.name),
      contentType: f.type || "application/octet-stream",
      data: Buffer.from(await f.arrayBuffer()),
    })),
  );
}

export function validateUploads(files: IncomingFile[]): string | null {
  if (files.length > MAX_FILES) return `You can attach up to ${MAX_FILES} files at a time`;
  const total = files.reduce((n, f) => n + f.data.length, 0);
  if (total > MAX_UPLOAD_BYTES) return "Attachments can total at most 4 MB per message";
  return null;
}

export async function saveAttachments(opts: {
  ticketId: string;
  commentId: string | null;
  uploadedById: string;
  files: IncomingFile[];
}) {
  for (const f of opts.files) {
    const storageKey = await storeFile(f.data, f.contentType, opts.ticketId);
    await db.attachment.create({
      data: {
        ticketId: opts.ticketId,
        commentId: opts.commentId,
        uploadedById: opts.uploadedById,
        filename: f.filename,
        contentType: f.contentType,
        size: f.data.length,
        storageKey,
      },
    });
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
