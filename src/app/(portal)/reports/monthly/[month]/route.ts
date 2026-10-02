import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentViewer } from "@/lib/session";
import { isStaff } from "@/lib/access";
import { buildMonthlySummary, parseMonth, renderMonthlyPdf } from "@/lib/monthly-report";

/**
 * Monthly summary PDF. Client admins get their own organisation's; staff can
 * pass ?org=<id> for any client.
 */
export async function GET(req: Request, { params }: { params: Promise<{ month: string }> }) {
  const viewer = await currentViewer();
  if (!viewer) return new NextResponse("Not found", { status: 404 });
  const parsed = parseMonth((await params).month);
  if (!parsed) return new NextResponse("Not found", { status: 404 });

  let organizationId: string | null = null;
  if (isStaff(viewer)) organizationId = new URL(req.url).searchParams.get("org");
  else if (viewer.role === "CLIENT" && viewer.orgAdmin) organizationId = viewer.organizationId;
  if (!organizationId || !(await db.organization.findUnique({ where: { id: organizationId }, select: { id: true } }))) {
    return new NextResponse("Not found", { status: 404 });
  }

  const summary = await buildMonthlySummary(organizationId, parsed.year, parsed.month);
  const pdf = await renderMonthlyPdf(summary);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${summary.slug}-support-summary-${(await params).month}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
