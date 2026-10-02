import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { surveyToken } from "../../src/lib/survey";

/**
 * Seeds a fixed, idempotent set of records covering every page state the
 * accessibility suite visits, and creates database sessions so tests can
 * sign in without email.
 */
export const AUTH_DIR = path.join(__dirname, ".auth");

export default async function globalSetup() {
  const db = new PrismaClient();
  const day = 24 * 60 * 60 * 1000;
  try {
    const org = await db.organization.upsert({
      where: { slug: "a11y-test" },
      create: { id: "a11y-org", name: "A11y Test Ltd", slug: "a11y-test", emailDomains: ["a11y.example"], contractEndsAt: new Date("2023-01-31") },
      update: { contractEndsAt: new Date("2023-01-31") },
    });
    const product = await db.product.upsert({
      where: { organizationId_slug: { organizationId: org.id, slug: "test-product" } },
      create: { id: "a11y-product", organizationId: org.id, name: "Test Product", slug: "test-product" },
      update: {},
    });
    const admin = await db.user.upsert({
      where: { email: "a11y-admin@s6a.example" },
      create: { id: "a11yadmin", email: "a11y-admin@s6a.example", name: "Alex Admin", role: "ADMIN" },
      update: { role: "ADMIN", active: true },
    });
    const client = await db.user.upsert({
      where: { email: "casey@a11y.example" },
      create: { id: "a11yclient", email: "casey@a11y.example", name: "Casey Client", organizationId: org.id, orgAdmin: true },
      update: { active: true, organizationId: org.id, orgAdmin: true },
    });
    await db.user.upsert({
      where: { email: "colin@a11y.example" },
      create: { id: "a11ycolleague", email: "colin@a11y.example", name: "Colin Colleague", organizationId: org.id },
      update: { active: true },
    });

    const openTicket = await db.ticket.upsert({
      where: { id: "a11y-open" },
      create: {
        id: "a11y-open",
        subject: "Report export fails for large date ranges",
        description: "Exporting more than **90 days** of data shows an error.\n\n- Started on Monday\n- Affects all users",
        type: "BUG",
        priority: "HIGH",
        organizationId: org.id,
        productId: product.id,
        requesterId: client.id,
        assigneeId: admin.id,
        aiStatus: "DONE",
        aiSummary: "Export of long date ranges fails for all users.",
        aiSuggestedType: "BUG",
        aiSuggestedPriority: "HIGH",
        aiPriorityReason: "Reporting is blocked for everyone.",
        createdAt: new Date(Date.now() - 2 * day),
      },
      update: {},
    });
    if ((await db.comment.count({ where: { ticketId: openTicket.id } })) === 0) {
      await db.comment.createMany({
        data: [
          { ticketId: openTicket.id, authorId: admin.id, body: "Thanks Casey, we're looking into this." },
          { ticketId: openTicket.id, authorId: admin.id, body: "Query times out above 90 days.", internal: true },
          { ticketId: openTicket.id, authorId: client.id, body: "It happens for 91 days too.", source: "EMAIL" },
        ],
      });
      await db.aiDraft.create({
        data: { ticketId: openTicket.id, body: "Hi Casey,\n\nWe've found the cause and are working on a fix.", confidence: "medium", kbArticleSlugs: ["a11y-exporting-reports"] },
      });
    }

    const resolvedTicket = await db.ticket.upsert({
      where: { id: "a11y-resolved" },
      create: {
        id: "a11y-resolved",
        subject: "How do I add a user?",
        description: "Where do I add a new user?",
        status: "RESOLVED",
        resolvedAt: new Date(),
        pausedAt: new Date(),
        firstRespondedAt: new Date(),
        organizationId: org.id,
        productId: product.id,
        requesterId: client.id,
      },
      update: {},
    });

    await db.article.upsert({
      where: { slug: "a11y-exporting-reports" },
      create: {
        slug: "a11y-exporting-reports",
        title: "Exporting reports",
        body: "## Steps\n\n1. Open **Reports**\n2. Choose a date range\n3. Select **Export**\n\n| Range | Format |\n|---|---|\n| Up to 90 days | CSV |",
        published: true,
        productId: product.id,
        authorId: admin.id,
      },
      update: {},
    });
    if ((await db.cannedResponse.count()) === 0) {
      await db.cannedResponse.create({ data: { title: "Thanks, investigating", body: "Hi {{requester_first_name}},\n\nThanks — we're investigating.", createdById: admin.id } });
    }

    const notice = await db.serviceNotice.upsert({
      where: { id: "a11y-notice" },
      create: {
        id: "a11y-notice",
        kind: "INCIDENT",
        title: "Report exports failing",
        body: "Exports of more than 90 days are failing. **Workaround:** export in smaller ranges.",
        createdById: admin.id,
        products: { connect: [{ id: product.id }] },
      },
      update: { status: "ACTIVE", resolvedAt: null },
    });
    await db.ticket.update({ where: { id: openTicket.id }, data: { noticeId: notice.id } });

    const expires = new Date(Date.now() + day);
    await mkdir(AUTH_DIR, { recursive: true });
    for (const [name, user] of [
      ["admin", admin],
      ["client", client],
    ] as const) {
      const sessionToken = `a11y-session-${name}`;
      await db.session.upsert({
        where: { sessionToken },
        create: { sessionToken, userId: user.id, expires },
        update: { expires, lastSeenAt: new Date() },
      });
      await writeFile(
        path.join(AUTH_DIR, `${name}.json`),
        JSON.stringify({
          cookies: [
            { name: "authjs.session-token", value: sessionToken, domain: "localhost", path: "/", expires: expires.getTime() / 1000, httpOnly: true, secure: false, sameSite: "Lax" },
          ],
          origins: [],
        }),
      );
    }

    await writeFile(
      path.join(AUTH_DIR, "fixtures.json"),
      JSON.stringify({
        openTicket: openTicket.number,
        resolvedTicket: resolvedTicket.number,
        orgId: org.id,
        clientId: client.id,
        adminId: admin.id,
        noticeId: notice.id,
        surveyToken: surveyToken(resolvedTicket.number, client.id, process.env.AUTH_SECRET ?? ""),
      }),
    );
  } finally {
    await db.$disconnect();
  }
}
