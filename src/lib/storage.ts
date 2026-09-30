import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { get, put } from "@vercel/blob";

/**
 * File storage for attachments. Uses a private Vercel Blob store when
 * BLOB_READ_WRITE_TOKEN is set; otherwise writes to ./.uploads for local
 * development. Files are only ever served through /api/attachments/[id],
 * which checks the viewer may see the ticket.
 */

const LOCAL_DIR = path.join(process.cwd(), ".uploads");
const useBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;

export async function storeFile(data: Buffer, contentType: string, ticketId: string): Promise<string> {
  const key = `tickets/${ticketId}/${randomUUID()}`;
  if (useBlob()) {
    const blob = await put(key, data, { access: "private", contentType, addRandomSuffix: false });
    return blob.pathname;
  }
  await mkdir(path.join(LOCAL_DIR, "tickets", ticketId), { recursive: true });
  await writeFile(path.join(LOCAL_DIR, key), data);
  return key;
}

export async function readFileStream(key: string): Promise<ReadableStream<Uint8Array> | null> {
  if (useBlob()) {
    const result = await get(key, { access: "private" });
    return result?.stream ?? null;
  }
  if (key.includes("..")) return null;
  try {
    const buf = await readFile(path.join(LOCAL_DIR, key));
    return new Blob([new Uint8Array(buf)]).stream();
  } catch {
    return null;
  }
}

export async function readFileBuffer(key: string): Promise<Buffer | null> {
  const stream = await readFileStream(key);
  if (!stream) return null;
  return Buffer.from(await new Response(stream).arrayBuffer());
}
