/**
 * Creates the first admin, plus optional demo data.
 *   SEED_ADMIN_EMAIL=you@s6a.io npm run db:seed
 *   SEED_DEMO=1 SEED_ADMIN_EMAIL=... npm run db:seed
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail) throw new Error("Set SEED_ADMIN_EMAIL to the email address of the first admin");

  const admin = await db.user.upsert({
    where: { email: adminEmail },
    create: { email: adminEmail, name: process.env.SEED_ADMIN_NAME ?? "Admin", role: "ADMIN" },
    update: { role: "ADMIN", active: true },
  });
  console.log(`Admin: ${admin.email}`);

  if (!process.env.SEED_DEMO) return;

  const acme = await db.organization.upsert({
    where: { slug: "acme" },
    create: { name: "Acme Ltd", slug: "acme", emailDomains: ["acme.example"], authMethods: ["MAGIC_LINK"] },
    update: {},
  });
  const portal = await db.product.upsert({
    where: { organizationId_slug: { organizationId: acme.id, slug: "customer-portal" } },
    create: { organizationId: acme.id, name: "Customer Portal", slug: "customer-portal", description: "Customer-facing web portal" },
    update: {},
  });
  await db.product.upsert({
    where: { organizationId_slug: { organizationId: acme.id, slug: "warehouse-app" } },
    create: { organizationId: acme.id, name: "Warehouse App", slug: "warehouse-app", description: "Mobile stock-taking app" },
    update: {},
  });
  const jane = await db.user.upsert({
    where: { email: "jane@acme.example" },
    create: { email: "jane@acme.example", name: "Jane Client", organizationId: acme.id },
    update: {},
  });

  if ((await db.ticket.count()) === 0) {
    const t = await db.ticket.create({
      data: {
        subject: "Invoices page times out",
        description: "Since this morning the Invoices page spins for ~30s and then shows an error.\n\nAffects all users.",
        type: "BUG",
        priority: "HIGH",
        organizationId: acme.id,
        productId: portal.id,
        requesterId: jane.id,
        assigneeId: admin.id,
        status: "IN_PROGRESS",
      },
    });
    await db.comment.create({ data: { ticketId: t.id, authorId: admin.id, body: "Thanks Jane — we're looking into this now." } });
    await db.comment.create({ data: { ticketId: t.id, authorId: admin.id, internal: true, body: "Slow query on invoices.list — check the missing index." } });
  }

  await db.article.upsert({
    where: { slug: "resetting-a-customer-password" },
    create: {
      slug: "resetting-a-customer-password",
      title: "Resetting a customer's password",
      productId: portal.id,
      authorId: admin.id,
      published: true,
      body: "## Steps\n\n1. Open **Admin → Customers**\n2. Find the customer and choose **Reset password**\n3. The customer receives an email with a reset link valid for 24 hours.\n\n> If the email doesn't arrive, ask the customer to check their spam folder.",
    },
    update: {},
  });
  console.log("Demo data created (client login: jane@acme.example)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
