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

const AUTH_METHODS: AuthMethod[] = ["MAGIC_LINK", "MICROSOFT", "GOOGLE", "OIDC"];

function back(path: string, params: Record<string, string>): never {
  redirect(`${path}?${new URLSearchParams(params).toString()}`);
}

function isUniqueViolation(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

// ---- Organisations ----------------------------------------------------------

export async function createOrganization(formData: FormData) {
  await requireAdmin();
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
  redirect(`/admin/organizations/${org.id}`);
}

export async function updateOrganization(formData: FormData) {
  await requireAdmin();
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

  await db.organization.update({
    where: { id },
    data: {
      name: String(formData.get("name") ?? "").trim() || undefined,
      emailDomains: parseDomains(String(formData.get("emailDomains") ?? "")),
      autoJoin: formData.get("autoJoin") === "on",
      authMethods,
      entraTenantId,
      googleHostedDomain: String(formData.get("googleHostedDomain") ?? "").trim().toLowerCase() || null,
      oidcProviderKey,
    },
  });
  revalidatePath(path);
  back(path, { notice: "Settings saved" });
}

export async function addProduct(formData: FormData) {
  await requireAdmin();
  const organizationId = String(formData.get("organizationId"));
  const path = `/admin/organizations/${organizationId}`;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) back(path, { error: "Product name is required" });

  try {
    await db.product.create({
      data: {
        organizationId,
        name,
        slug: slugify(name),
        description: String(formData.get("description") ?? "").trim() || null,
      },
    });
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

  await db.user.upsert({
    where: { email },
    create: { email, name: parsed.data.name, organizationId, role: "CLIENT" },
    update: { organizationId, active: true, ...(parsed.data.name ? { name: parsed.data.name } : {}) },
  });

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

  await db.user.upsert({
    where: { email },
    create: { email, name: parsed.data.name, role: role.data },
    update: { role: role.data, active: true },
  });
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

  await db.user.update({ where: { id: userId }, data: { active } });
  // Deactivation takes effect immediately by ending any open sessions.
  if (!active) await db.session.deleteMany({ where: { userId } });
  revalidatePath(returnTo);
}

export async function setStaffRole(formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId"));
  const role = z.enum(["AGENT", "ADMIN"]).parse(formData.get("role"));
  if (userId === admin.id) back("/admin/staff", { error: "You can't change your own role" });
  await db.user.update({ where: { id: userId, role: { in: ["AGENT", "ADMIN"] } }, data: { role } });
  revalidatePath("/admin/staff");
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
  const parsed = articleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back(returnPath, { error: "Title, product and body are required" });
  const published = formData.get("published") === "on";

  if (id) {
    await db.article.update({ where: { id }, data: { ...parsed.data, published } });
  } else {
    const base = slugify(parsed.data.title) || "article";
    let slug = base;
    for (let i = 2; await db.article.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${base}-${i}`;
    const article = await db.article.create({ data: { ...parsed.data, published, slug, authorId: staff.id } });
    revalidatePath("/kb");
    redirect(`/admin/articles/${article.id}?notice=Article+created`);
  }
  revalidatePath("/kb");
  back(returnPath, { notice: "Article saved" });
}

export async function deleteArticle(formData: FormData) {
  await requireStaff();
  await db.article.delete({ where: { id: String(formData.get("id")) } });
  revalidatePath("/kb");
  redirect("/admin/articles");
}
