import { NextResponse } from "next/server";
import { currentViewer } from "@/lib/session";
import { isAdmin } from "@/lib/access";
import { exportUserData } from "@/lib/privacy";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";

/** Subject access request export, as a JSON download. Admins only. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await currentViewer();
  if (!viewer || !isAdmin(viewer)) return new NextResponse("Not found", { status: 404 });

  const { id } = await params;
  const exists = await db.user.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return new NextResponse("Not found", { status: 404 });

  const data = await exportUserData(id);
  await audit({ actorId: viewer.id, action: "user.exported", entityType: "user", entityId: id, summary: "Exported a user's personal data" });

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="personal-data-${id}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
