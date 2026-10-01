"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { Prisma, type AuthMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin, requireStaff } from "@/lib/session";
import { parseDomains, slugify } from "@/lib/slug";
import { normaliseEmail } from "@/lib/login-policy";
import { appUrl, brand } from "@/lib/config";
import { sendEmail } from "@/lib/email/send";
import { renderEmail } from "@/lib/email/templates";
import { audit, diff } from "@/lib/audit";
import { eraseUser as eraseUserData } from "@/lib/privacy";
import { deleteOrganizationData, isPastRetention } from "@/lib/retention";

const AUTH_METHODS: AuthMethod[] = ["MAGIC_LINK", "MICROSOFT", "GOOGLE", "OIDC"];

function back(path: string, params: Record<string, string>): never {
  redirect(`${path}?${new URLSearchParams(params).toString()}`);
}

function isUniqueViolation(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

// ---- Organisations ----------------------------------------------------------

export async function createOrganization(formData: FormData) {
  const admin = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) back("/admin/organizations", { error: "Name is required" });

  let org;
  try {
    org = await db.organization.create({
      data: {
        name,
        slug: slugify(name) || `org-${Date.now()}`,
        emailDomains: parseDomains(String(formData.get("emailDomains") ?? "")),
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) back("/admin/organizations", { error: "An organisation with that name already exists" });
    throw err;
  }
  await audit({ actorId: admin.id, action: "organization.created", entityType: "organization", entityId: org.id, summary: `Created client ${org.name}` });
  redirect(`/admin/organizations/${org.id}`);
}

const dateInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((s) => new Date(`${s}T00:00:00Z`));

export async function updateOrganization(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id"));
  const path = `/admin/organizations/${id}`;
  const authMethods = formData.getAll("authMethods").map(String).filter((m): m is AuthMethod => AUTH_METHODS.includes(m as AuthMethod));
  if (authMethods.length === 0) back(path, { error: "Choose at least one sign-in method" });

  const oidcProviderKey = String(formData.get("oidcProviderKey") ?? "").trim() || null;
  if (authMethods.includes("OIDC") && !oidcProviderKey) back(path, { error: "Choose which OIDC provider this organisation uses" });

  const entraTenantId = String(formData.get("entraTenantId") ?? "").trim() || null;
  if (authMethods.includes("MICROSOFT") && !entraTenantId) {
    back(path, { error: "Microsoft sign-in needs the client's Entra tenant ID" });
  }

  const rawContractEnd = String(formData.get("contractEndsAt") ?? "").trim();
  const contractEnd = rawContractEnd ? dateInput.safeParse(rawContractEnd) : null;
  if (contractEnd && !contractEnd.success) back(path, { error: "Enter the contract end date as a date" });

  const before = await db.organization.findUniqueOrThrow({ where: { id } });
  const data = {
    name: String(formData.get("name") ?? "").trim() || before.name,
    emailDomains: parseDomains(String(formData.get("emailDomains") ?? "")),
    autoJoin: formData.get("autoJoin") === "on",
    authMethods,
    entraTenantId,
    googleHostedDomain: String(formData.get("googleHostedDomain") ?? "").trim().toLowerCase() || null,
    oidcProviderKey,
    aiEnabled: formData.get("aiEnabled") === "on",
    contractEndsAt: contractEnd?.success ? contractEnd.data : null,
  };
  await db.organization.update({ where: { id }, data });

  const changes = diff(before, data);
  if (Object.keys(changes).length) {
    await audit({
      actorId: admin.id,
      action: "organization.updated",
      entityType: "organization",
      entityId: id,
      summary: `Changed settings for ${data.name}: ${Object.keys(changes).join(", ")}`,
      details: changes as never,
    });
  }
  revalidatePath(path);
  back(path, { notice: "Settings saved" });
}

/** Targets are entered in business hours (a business day is 8 hours). */
export async function updateSlaTargets(formData: FormData) {
  const admin = await requireAdmin();
  const organizationId = String(formData.get("organizationId"));
  const path = `/admin/organizations/${organizationId}`;
  const hours = z.coerce.number().positive().max(2000);

  const rows = [];
  for (const priority of ["URGENT", "HIGH", "NORMAL", "LOW"] as const) {
    const fr = hours.safeParse(formData.get(`${priority}.firstResponse`));
    const res = hours.safeParse(formData.get(`${priority}.resolution`));
    if (!fr.success || !res.success) back(path, { error: "SLA targets must be positive numbers of hours" });
    if (fr.data > res.data) back(path, { error: "A first-response target can't be longer than the resolution target" });
    rows.push({ priority, firstResponseMinutes: Math.round(fr.data * 60), resolutionMinutes: Math.round(res.data * 60) });
  }

  await db.$transaction(
    rows.map((r) =>
      db.slaTarget.upsert({
        where: { organizationId_priority: { organizationId, priority: r.priority } },
        create: { organizationId, ...r },
        update: { firstResponseMinutes: r.firstResponseMinutes, resolutionMinutes: r.resolutionMinutes },
      }),
    ),
  );
  await audit({
    actorId: admin.id,
    action: "organization.sla_updated",
    entityType: "organization",
    entityId: organizationId,
    summary: "Changed SLA targets",
    details: rows,
  });
  revalidatePath(path);
  back(path, { notice: "SLA targets saved" });
}

export async function addProduct(formData: FormData) {
  const admin = await requireAdmin();
  const organizationId = String(formData.get("organizationId"));
  const path = `/admin/organizations/${organizationId}`;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) back(path, { error: "Product name is required" });

  try {
    const product = await db.product.create({
      data: {
        organizationId,
        name,
        slug: slugify(name),
        description: String(formData.get("description") ?? "").trim() || null,
      },
    });
    await audit({ actorId: admin.id, action: "product.created", entityType: "organization", entityId: organizationId, summary: `Added product ${name}`, details: { productId: product.id } });
  } catch (err) {
    if (isUniqueViolation(err)) back(path, { error: "This organisation already has a product with that name" });
    throw err;
  }
  revalidatePath(path);
  back(path, { notice: `Added ${name}` });
}

// ---- Users ------------------------------------------------------------------

const inviteSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().max(120).optional(),
});

async function sendInvitation(email: string, inviterName: string) {
  const url = appUrl(`/login?email=${encodeURIComponent(email)}`);
  const { text, html } = renderEmail({
    heading: `You've been invited to ${brand.name}`,
    bodyText: `${inviterName} has given you access to ${brand.name}, where you can raise support requests, follow their progress and browse help articles.`,
    action: { label: "Sign in", url },
  });
  await sendEmail({ to: email, subject: `Your access to ${brand.name}`, text, html });
}

export async function inviteClientUser(formData: FormData) {
  const admin = await requireAdmin();
  const organizationId = String(formData.get("organizationId"));
  const path = `/admin/organizations/${organizationId}`;
  const parsed = inviteSchema.safeParse({ email: formData.get("email"), name: formData.get("name") || undefined });
  if (!parsed.success) back(path, { error: "Enter a valid email address" });

  const email = normaliseEmail(parsed.data.email);
  const existing = await db.user.findUnique({ where: { email } });
  if (existing && (existing.role !== "CLIENT" || (existing.organizationId && existing.organizationId !== organizationId))) {
    back(path, { error: `${email} already belongs to another organisation or is a staff member` });
  }

  const user = await db.user.upsert({
    where: { email },
    create: { email, name: parsed.data.name, organizationId, role: "CLIENT" },
    update: { organizationId, active: true, ...(parsed.data.name ? { name: parsed.data.name } : {}) },
  });
  await audit({ actorId: admin.id, action: "user.invited", entityType: "user", entityId: user.id, summary: `Invited ${email} as a client user`, details: { organizationId } });

  after(() => sendInvitation(email, admin.name ?? brand.name).catch((e) => console.error("Invitation email failed", e)));
  revalidatePath(path);
  back(path, { notice: `Invited ${email}` });
}

export async function inviteStaffUser(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = inviteSchema.safeParse({ email: formData.get("email"), name: formData.get("name") || undefined });
  const role = z.enum(["AGENT", "ADMIN"]).safeParse(formData.get("role"));
  if (!parsed.success || !role.success) back("/admin/staff", { error: "Enter a valid email address and role" });

  const email = normaliseEmail(parsed.data.email);
  const existing = await db.user.findUnique({ where: { email } });
  if (existing?.role === "CLIENT") back("/admin/staff", { error: `${email} is a client user` });

  const user = await db.user.upsert({
    where: { email },
    create: { email, name: parsed.data.name, role: role.data },
    update: { role: role.data, active: true },
  });
  await audit({ actorId: admin.id, action: "user.invited", entityType: "user", entityId: user.id, summary: `Invited ${email} as ${role.data.toLowerCase()}` });
  after(() => sendInvitation(email, admin.name ?? brand.name).catch((e) => console.error("Invitation email failed", e)));
  revalidatePath("/admin/staff");
  back("/admin/staff", { notice: `Invited ${email}` });
}

export async function setUserActive(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId"));
  const active = formData.get("active") === "true";
  const returnTo = String(formData.get("returnTo") ?? "/admin/staff");
  if (userId === admin.id && !active) back(returnTo, { error: "You can't deactivate your own account" });

  const user = await db.user.update({ where: { id: userId }, data: { active } });
  // Deactivation takes effect immediately by ending any open sessions.
  if (!active) await db.session.deleteMany({ where: { userId } });
  await audit({
    actorId: admin.id,
    action: active ? "user.reactivated" : "user.deactivated",
    entityType: "user",
    entityId: userId,
    summary: `${active ? "Reactivated" : "Deactivated"} ${user.email}`,
  });
  revalidatePath(returnTo);
}

export async function setStaffRole(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId"));
  const role = z.enum(["AGENT", "ADMIN"]).parse(formData.get("role"));
  if (userId === admin.id) back("/admin/staff", { error: "You can't change your own role" });
  const before = await db.user.findUniqueOrThrow({ where: { id: userId } });
  await db.user.update({ where: { id: userId, role: { in: ["AGENT", "ADMIN"] } }, data: { role } });
  if (before.role !== role) {
    await audit({
      actorId: admin.id,
      action: "user.role_changed",
      entityType: "user",
      entityId: userId,
      summary: `Changed ${before.email} from ${before.role.toLowerCase()} to ${role.toLowerCase()}`,
      details: { role: { from: before.role, to: role } },
    });
  }
  revalidatePath("/admin/staff");
}

/** UK GDPR right to erasure: anonymise the person, keep the ticket history. */
export async function eraseUser(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId"));
  const path = `/admin/users/${userId}`;
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) back("/admin/staff", { error: "User not found" });
  if (user.id === admin.id) back(path, { error: "You can't erase your own account" });
  if (user.role === "AI") back(path, { error: "The AI assistant can't be erased" });
  if (normaliseEmail(String(formData.get("confirmEmail") ?? "")) !== user.email) {
    back(path, { error: "Type the person's email address exactly to confirm erasure" });
  }

  await eraseUserData(user.id);
  // The audit entry deliberately omits the erased email address.
  await audit({ actorId: admin.id, action: "user.erased", entityType: "user", entityId: user.id, summary: "Erased a user's personal data (name and email anonymised)" });
  back(path, { notice: "Personal data erased" });
}

// ---- Retention ----------------------------------------------------------------

export async function deleteClientData(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("organizationId"));
  const org = await db.organization.findUnique({ where: { id } });
  if (!org) back("/admin/retention", { error: "Client not found" });
  if (!isPastRetention(org.contractEndsAt)) back("/admin/retention", { error: `${org.name} is still within its retention period` });
  if (String(formData.get("confirmName") ?? "").trim() !== org.name) {
    back("/admin/retention", { error: `Type "${org.name}" exactly to confirm deletion` });
  }

  const counts = await deleteOrganizationData(org.id);
  await audit({
    actorId: admin.id,
    action: "retention.deleted",
    entityType: "retention",
    entityId: org.id,
    summary: `Permanently deleted client ${org.name} after its retention period`,
    details: counts,
  });
  revalidatePath("/admin/retention");
  back("/admin/retention", { notice: `Deleted ${org.name}: ${counts.tickets} tickets, ${counts.files} files, ${counts.users} users` });
}

// ---- Articles (all staff) ---------------------------------------------------

const articleSchema = z.object({
  title: z.string().trim().min(3).max(200),
  productId: z.string().min(1),
  body: z.string().trim().min(1).max(100_000),
});

export async function saveArticle(formData: FormData) {
  const staff = await requireStaff();
  const id = String(formData.get("id") ?? "");
  const returnPath = id ? `/admin/articles/${id}` : "/admin/articles/new";
  const parsed = articleSchema.safeParse({ title: formData.get("title"), productId: formData.get("productId"), body: formData.get("body") });
  if (!parsed.success) back(returnPath, { error: "Title, product and body are required" });
  const published = formData.get("published") === "on";

  if (id) {
    await db.article.update({ where: { id }, data: { ...parsed.data, published } });
    await audit({ actorId: staff.id, action: "article.updated", entityType: "article", entityId: id, summary: `Edited article "${parsed.data.title}"`, details: { published } });
  } else {
    const base = slugify(parsed.data.title) || "article";
    let slug = base;
    for (let i = 2; await db.article.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${base}-${i}`;
    const article = await db.article.create({ data: { ...parsed.data, published, slug, authorId: staff.id } });
    await audit({ actorId: staff.id, action: "article.created", entityType: "article", entityId: article.id, summary: `Created article "${article.title}"`, details: { published } });
    revalidatePath("/kb");
    redirect(`/admin/articles/${article.id}?notice=Article+created`);
  }
  revalidatePath("/kb");
  back(returnPath, { notice: "Article saved" });
}

export async function deleteArticle(formData: FormData) {
  const staff = await requireStaff();
  const article = await db.article.delete({ where: { id: String(formData.get("id")) } });
  await audit({ actorId: staff.id, action: "article.deleted", entityType: "article", entityId: article.id, summary: `Deleted article "${article.title}"` });
  revalidatePath("/kb");
  redirect("/admin/articles");
}

// ---- Canned responses (all staff) -------------------------------------------

const cannedSchema = z.object({
  title: z.string().trim().min(2, "Give the template a title").max(120),
  body: z.string().trim().min(1, "The template needs some text").max(20_000),
});

export async function saveCannedResponse(formData: FormData) {
  const staff = await requireStaff();
  const id = String(formData.get("id") ?? "");
  const parsed = cannedSchema.safeParse({ title: formData.get("title"), body: formData.get("body") });
  if (!parsed.success) back(id ? `/admin/canned/${id}` : "/admin/canned", { error: parsed.error.issues[0].message });

  if (id) {
    await db.cannedResponse.update({ where: { id }, data: parsed.data });
    await audit({ actorId: staff.id, action: "canned.updated", entityType: "canned_response", entityId: id, summary: `Edited saved reply "${parsed.data.title}"` });
  } else {
    const created = await db.cannedResponse.create({ data: { ...parsed.data, createdById: staff.id } });
    await audit({ actorId: staff.id, action: "canned.created", entityType: "canned_response", entityId: created.id, summary: `Created saved reply "${created.title}"` });
  }
  revalidatePath("/admin/canned");
  back("/admin/canned", { notice: "Saved reply saved" });
}

export async function deleteCannedResponse(formData: FormData) {
  const staff = await requireStaff();
  const deleted = await db.cannedResponse.delete({ where: { id: String(formData.get("id")) } });
  await audit({ actorId: staff.id, action: "canned.deleted", entityType: "canned_response", entityId: deleted.id, summary: `Deleted saved reply "${deleted.title}"` });
  revalidatePath("/admin/canned");
  back("/admin/canned", { notice: "Saved reply deleted" });
}
