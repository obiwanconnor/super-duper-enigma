import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isMonthlyReportDay, londonToday, monthRange, previousMonth, sendMonthlySummary } from "@/lib/monthly-report";

/**
 * Runs every weekday morning (vercel.json). On the first working day of the
 * month it emails each active client's summary for the previous month.
 * Pass ?force=1 to send outside the schedule (still at most once per month).
 */
export const maxDuration = 300;

function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return !!secret && given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const force = new URL(req.url).searchParams.get("force") === "1";
  if (!force && !isMonthlyReportDay()) return NextResponse.json({ ok: true, skipped: "not-first-working-day" });

  const today = londonToday();
  const { year, month } = previousMonth(today.year, today.month);
  const { from } = monthRange(year, month);

  // Clients whose contract hadn't ended before the month began.
  const orgs = await db.organization.findMany({
    where: { createdAt: { lt: monthRange(today.year, today.month).from }, OR: [{ contractEndsAt: null }, { contractEndsAt: { gte: from } }] },
    select: { id: true },
  });

  const results = [];
  for (const org of orgs) results.push({ organizationId: org.id, ...(await sendMonthlySummary(org.id, year, month)) });
  return NextResponse.json({ ok: true, month: `${year}-${String(month).padStart(2, "0")}`, results });
}
