import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canViewTicket, isStaff } from "@/lib/access";
import { currentViewer } from "@/lib/session";
import { INLINE_IMAGE_TYPES } from "@/lib/attachments";
import { readFileStream } from "@/lib/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await currentViewer();
  if (!viewer) return new NextResponse("Unauthorised", { status: 401 });

  const attachment = await db.attachment.findUnique({
    where: { id: (await params).id },
    include: { ticket: { select: { organizationId: true } }, comment: { select: { internal: true } } },
  });
  const hidden = attachment?.comment?.internal && !isStaff(viewer);
  if (!attachment || hidden || !canViewTicket(viewer, attachment.ticket)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const stream = await readFileStream(attachment.storageKey);
  if (!stream) return new NextResponse("Not found", { status: 404 });

  // Only well-known image types render inline; anything else (HTML, SVG,
  // PDFs…) is forced to download so it can't run in our origin.
  const inline = INLINE_IMAGE_TYPES.includes(attachment.contentType);
  return new NextResponse(stream, {
    headers: {
      "Content-Type": inline ? attachment.contentType : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
      "Content-Length": String(attachment.size),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, max-age=300",
    },
  });
}
