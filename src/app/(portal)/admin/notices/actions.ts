"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { audit } from "@/lib/audit";
import { emailNotice, parseLondonDateTime } from "@/lib/notices";

const schema = z.object({
  kind: z.enum(["INCIDENT", "MAINTENANCE"]),
  title: z.string().trim().min(3, "Give the notice a short title").max(160),
  body: z.string().trim().min(5, "Describe the impact for clients").max(5000),
});

function parseTimes(formData: FormData, back: string) {
  const rawStart = String(formData.get("startsAt") ?? "").trim();
  const rawEnd = String(formData.get("endsAt") ?? "").trim();
  const startsAt = rawStart ? parseLondonDateTime(rawStart) : new Date();
  const endsAt = rawEnd ? parseLondonDateTime(rawEnd) : null;
  if (!startsAt || (rawEnd && !endsAt)) redirect(`${back}?error=${encodeURIComponent("Enter valid start and end times")}`);
  if (endsAt && endsAt <= startsAt) redirect(`${back}?error=${encodeURIComponent("The end time must be after the start time")}`);
  return { startsAt, endsAt };
}

export async function createNotice(formData: FormData) {
  const staff = await requireStaff();
  const back = "/admin/notices/new";
  const parsed = schema.safeParse({ kind: formData.get("kind"), title: formData.get("title"), body: formData.get("body") });
  if (!parsed.success) redirect(`${back}?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  const productIds = formData.getAll("productIds").map(String);
  if (productIds.length === 0) redirect(`${back}?error=${encodeURIComponent("Choose at least one affected product")}`);
  const times = parseTimes(formData, back);

  const notice = await db.serviceNotice.create({
    data: { ...parsed.data, ...times, createdById: staff.id, products: { connect: productIds.map((id) => ({ id })) } },
  });
  await audit({ actorId: staff.id, action: "notice.published", entityType: "notice", entityId: notice.id, summary: `Published ${notice.kind.toLowerCase()} notice "${notice.title}"`, details: { productIds } });
  if (formData.get("email") === "on") after(() => emailNotice(notice.id, "published"));
  revalidatePath("/", "layout");
  redirect(`/admin/notices/${notice.id}?notice=${encodeURIComponent("Notice published")}`);
}

export async function updateNotice(formData: FormData) {
  const staff = await requireStaff();
  const id = String(formData.get("id"));
  const back = `/admin/notices/${id}`;
  const parsed = schema.safeParse({ kind: formData.get("kind"), title: formData.get("title"), body: formData.get("body") });
  if (!parsed.success) redirect(`${back}?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  const times = parseTimes(formData, back);

  const notice = await db.serviceNotice.update({ where: { id }, data: { ...parsed.data, ...times } });
  await audit({ actorId: staff.id, action: "notice.updated", entityType: "notice", entityId: id, summary: `Updated notice "${notice.title}"` });
  if (formData.get("email") === "on") after(() => emailNotice(id, "updated"));
  revalidatePath("/", "layout");
  redirect(`${back}?notice=${encodeURIComponent("Notice updated")}`);
}

export async function resolveNotice(formData: FormData) {
  const staff = await requireStaff();
  const id = String(formData.get("id"));
  const notice = await db.serviceNotice.update({ where: { id }, data: { status: "RESOLVED", resolvedAt: new Date() } });
  await audit({ actorId: staff.id, action: "notice.resolved", entityType: "notice", entityId: id, summary: `Resolved notice "${notice.title}"` });
  if (formData.get("email") === "on") after(() => emailNotice(id, "resolved"));
  revalidatePath("/", "layout");
  redirect(`/admin/notices/${id}?notice=${encodeURIComponent("Notice resolved")}`);
}
