"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireClientAdmin } from "@/lib/session";
import { normaliseEmail } from "@/lib/login-policy";
import { sendInvitation } from "@/lib/invitations";
import { audit } from "@/lib/audit";
import { brand } from "@/lib/config";

function back(params: Record<string, string>): never {
  redirect(`/team?${new URLSearchParams(params).toString()}`);
}

export async function inviteTeamMember(formData: FormData) {
  const admin = await requireClientAdmin();
  const parsed = z
    .object({ email: z.string().trim().email(), name: z.string().trim().max(120).optional() })
    .safeParse({ email: formData.get("email"), name: formData.get("name") || undefined });
  if (!parsed.success) back({ error: "Enter a valid email address" });

  const email = normaliseEmail(parsed.data.email);
  const org = await db.organization.findUniqueOrThrow({ where: { id: admin.organizationId }, select: { emailDomains: true } });
  const domain = email.split("@")[1];
  if (org.emailDomains.length > 0 && !org.emailDomains.includes(domain)) {
    back({ error: `You can only invite people with an email address at ${org.emailDomains.join(" or ")}` });
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing && (existing.role !== "CLIENT" || (existing.organizationId && existing.organizationId !== admin.organizationId))) {
    back({ error: `${email} can't be added to your organisation. Please contact s6a support.` });
  }

  const user = await db.user.upsert({
    where: { email },
    create: { email, name: parsed.data.name, organizationId: admin.organizationId, role: "CLIENT" },
    update: { organizationId: admin.organizationId, active: true, ...(parsed.data.name ? { name: parsed.data.name } : {}) },
  });
  await audit({ actorId: admin.id, action: "user.invited", entityType: "user", entityId: user.id, summary: `Client admin invited ${email}`, details: { organizationId: admin.organizationId } });
  after(() => sendInvitation(email, admin.name ?? brand.name).catch((e) => console.error("Invitation email failed", e)));
  revalidatePath("/team");
  back({ notice: `Invited ${email}` });
}

export async function setTeamMemberActive(formData: FormData) {
  const admin = await requireClientAdmin();
  const userId = String(formData.get("userId"));
  const active = formData.get("active") === "true";
  if (userId === admin.id) back({ error: "You can't deactivate your own account" });

  const user = await db.user.findFirst({ where: { id: userId, organizationId: admin.organizationId, role: "CLIENT" } });
  if (!user) back({ error: "Person not found in your organisation" });

  await db.user.update({ where: { id: user.id }, data: { active } });
  if (!active) await db.session.deleteMany({ where: { userId: user.id } });
  await audit({
    actorId: admin.id,
    action: active ? "user.reactivated" : "user.deactivated",
    entityType: "user",
    entityId: user.id,
    summary: `Client admin ${active ? "reactivated" : "deactivated"} ${user.email}`,
  });
  revalidatePath("/team");
  back({ notice: `${user.name ?? user.email} ${active ? "reactivated" : "deactivated"}` });
}
