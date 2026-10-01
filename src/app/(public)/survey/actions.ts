"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { canViewTicket } from "@/lib/access";
import { parseSurveyToken } from "@/lib/survey";
import { recordSatisfaction } from "@/lib/satisfaction";

export async function submitSurvey(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const parsed = parseSurveyToken(token, process.env.AUTH_SECRET ?? "");
  if (!parsed) redirect(`/survey/${encodeURIComponent(token)}`);

  const [ticket, user] = await Promise.all([
    db.ticket.findUnique({ where: { number: parsed.ticketNumber } }),
    db.user.findUnique({ where: { id: parsed.userId } }),
  ]);
  if (!ticket || !user || !user.active || !canViewTicket(user, ticket)) redirect(`/survey/${token}`);

  const ok = await recordSatisfaction(ticket.id, user.id, formData);
  redirect(`/survey/${token}?${ok ? "done=1" : "error=1"}`);
}
