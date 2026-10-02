import path from "node:path";
import PDFDocument from "pdfkit";
import { db } from "./db";
import { brand } from "./config";
import { organizationReport, type ReportFigures } from "./reports";
import { formatBusinessDuration, firstWorkingDay, londonTime } from "./sla/business-time";
import { describeTarget, PRIORITIES, targetsFor } from "./sla/sla";
import { priorityLabels } from "./labels";
import { noticeKindLabels } from "./notices";

/** "2026-09" for September 2026. */
export type MonthKey = `${number}-${string}`;

export function parseMonth(key: string): { year: number; month: number } | null {
  const m = key.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  return m ? { year: +m[1], month: +m[2] } : null;
}

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** UK-time boundaries of a calendar month: [from, to). */
export function monthRange(year: number, month: number) {
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return { from: londonTime(year, month, 1, 0), to: londonTime(next.year, next.month, 1, 0) };
}

export function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function previousMonth(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/** Today's date in the UK. */
export function londonToday(now = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "numeric", day: "numeric" })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  return { year: +p.year, month: +p.month, day: +p.day };
}

/** Summaries go out on the first working day of each month, covering the previous month. */
export function isMonthlyReportDay(now = new Date()): boolean {
  const t = londonToday(now);
  return t.day === firstWorkingDay(t.year, t.month);
}

/** Months a summary can be downloaded for: from the client's first month to last month. */
export function availableMonths(createdAt: Date, now = new Date(), max = 12) {
  const start = londonToday(createdAt);
  let cur = previousMonth(londonToday(now).year, londonToday(now).month);
  const out: { year: number; month: number; key: string; label: string }[] = [];
  while (out.length < max && (cur.year > start.year || (cur.year === start.year && cur.month >= start.month))) {
    out.push({ ...cur, key: monthKey(cur.year, cur.month), label: monthLabel(cur.year, cur.month) });
    cur = previousMonth(cur.year, cur.month);
  }
  return out;
}

export type MonthlySummary = Awaited<ReturnType<typeof buildMonthlySummary>>;

export async function buildMonthlySummary(organizationId: string, year: number, month: number) {
  const { from, to } = monthRange(year, month);
  const [org, report, notices] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: organizationId }, include: { slaTargets: true } }),
    organizationReport(organizationId, from, to),
    db.serviceNotice.findMany({
      where: { products: { some: { organizationId } }, startsAt: { lt: to }, OR: [{ resolvedAt: null }, { resolvedAt: { gte: from } }] },
      orderBy: { startsAt: "asc" },
      select: { kind: true, title: true, startsAt: true, resolvedAt: true },
    }),
  ]);
  return {
    organization: org.name,
    slug: org.slug,
    year,
    month,
    label: monthLabel(year, month),
    report,
    notices,
    targets: PRIORITIES.map((p) => ({ priority: priorityLabels[p], ...targetsFor(p, org.slaTargets) })),
  };
}

const dur = (m: number | null) => (m === null ? "No data" : formatBusinessDuration(m));
const pct = (p: number | null) => (p === null ? "No data" : `${p}%`);
const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

export function summaryRows(f: ReportFigures): [string, string][] {
  return [
    ["Tickets raised", String(f.created)],
    ["Tickets resolved", String(f.resolved)],
    ["Open at month end", String(f.open)],
    ["Median first response", dur(f.medianFirstResponse)],
    ["First response within target", pct(f.firstResponseWithinTarget)],
    ["Median time to resolve", dur(f.medianResolution)],
    ["Resolved within target", pct(f.resolvedWithinTarget)],
    ["Rated good", f.ratings ? `${pct(f.ratedGood)} of ${f.ratings} ${f.ratings === 1 ? "rating" : "ratings"}` : "No ratings"],
  ];
}

/** Plain-text version of the summary, used in the email body. */
export function summaryText(s: MonthlySummary): string {
  const lines = summaryRows(s.report.overall).map(([k, v]) => `- ${k}: ${v}`);
  return `Here is your support summary for ${s.label}.\n\n${lines.join("\n")}\n\nTimes are in business hours (Monday to Friday, 9am to 5pm UK time, excluding bank holidays). The attached PDF has the figures for each product.`;
}

// ---- PDF ------------------------------------------------------------------------

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
const FONT = path.join(FONT_DIR, "DejaVuSans.ttf");
const FONT_BOLD = path.join(FONT_DIR, "DejaVuSans-Bold.ttf");

const INK = "#1f2933";
const MUTED = "#4b5563";
const RULE = "#9aa5b1";
const BRAND = "#2f4ac4";

/**
 * Renders a tagged, accessible PDF: document language and title, logical
 * structure (H1/H2/P/Table/TR/TH/TD/L/LI), embedded fonts, and decorative
 * lines and page numbers marked as artifacts.
 */
export async function renderMonthlyPdf(s: MonthlySummary): Promise<Buffer> {
  const title = `${s.organization}: support summary for ${s.label}`;
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 56, bottom: 64, left: 56, right: 56 },
    tagged: true,
    lang: "en-GB",
    displayTitle: true,
    pdfVersion: "1.7",
    font: FONT,
    bufferPages: true,
    info: { Title: title, Author: brand.legalName, Subject: `Support summary for ${s.organization}`, Creator: brand.name },
  });
  doc.registerFont("Sans", FONT);
  doc.registerFont("Sans-Bold", FONT_BOLD);

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom;

  const root = doc.struct("Document");
  doc.addStructure(root);

  const ensureSpace = (needed: number) => {
    if (doc.y + needed > bottom()) doc.addPage();
  };

  const heading = (tag: "H1" | "H2", text: string) => {
    ensureSpace(tag === "H1" ? 60 : 50);
    if (tag === "H2") doc.moveDown(0.8);
    root.add(
      doc.struct(tag, {}, () => {
        doc.font("Sans-Bold").fontSize(tag === "H1" ? 18 : 13).fillColor(tag === "H1" ? BRAND : INK).text(text, left, doc.y, { width });
      }),
    );
    doc.moveDown(0.4);
  };

  const paragraph = (text: string, opts: { muted?: boolean; size?: number } = {}) => {
    ensureSpace(30);
    root.add(
      doc.struct("P", {}, () => {
        doc.font("Sans").fontSize(opts.size ?? 10).fillColor(opts.muted ? MUTED : INK).text(text, left, doc.y, { width });
      }),
    );
    doc.moveDown(0.5);
  };

  const rule = (y: number) => {
    doc.markContent("Artifact", { type: "Layout" });
    doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.5).strokeColor(RULE).stroke();
    doc.endMarkedContent();
  };

  /** A data table with a header row of TH cells (scope Column) and, optionally, row headers. */
  const table = (headers: string[], rows: string[][], fractions: number[], { rowHeaders = true } = {}) => {
    const colWidths = fractions.map((f) => f * width);
    const xs = colWidths.map((_, i) => left + colWidths.slice(0, i).reduce((a, b) => a + b, 0));
    const pad = 4;
    const t = doc.struct("Table");
    root.add(t);

    const drawRow = (cells: string[], header: boolean) => {
      doc.font(header ? "Sans-Bold" : "Sans").fontSize(9);
      const h = Math.max(...cells.map((c, i) => doc.heightOfString(c, { width: colWidths[i] - pad * 2 }))) + pad * 2;
      if (doc.y + h > bottom()) {
        doc.addPage();
      }
      const y = doc.y;
      const tr = doc.struct("TR");
      t.add(tr);
      cells.forEach((cell, i) => {
        const isHeader = header || (rowHeaders && i === 0);
        tr.add(
          doc.struct(isHeader ? "TH" : "TD", {}, () => {
            doc
              .font(header || (rowHeaders && i === 0) ? "Sans-Bold" : "Sans")
              .fontSize(9)
              .fillColor(INK)
              .text(cell, xs[i] + pad, y + pad, { width: colWidths[i] - pad * 2, align: i === 0 ? "left" : "right" });
          }),
        );
      });
      tr.end();
      rule(y + h);
      doc.y = y + h;
    };

    ensureSpace(40);
    rule(doc.y);
    drawRow(headers, true);
    rows.forEach((r) => drawRow(r, false));
    t.end();
    doc.x = left;
    doc.moveDown(0.6);
  };

  // ---- Content
  heading("H1", title);
  paragraph(
    `Prepared by ${brand.legalName} on ${dateFmt.format(new Date())}. Times are in business hours (Monday to Friday, 9am to 5pm UK time, excluding bank holidays) and exclude time spent waiting for a reply from you.`,
    { muted: true, size: 9 },
  );

  heading("H2", "At a glance");
  table(["Measure", s.label], summaryRows(s.report.overall), [0.6, 0.4]);

  heading("H2", "By product");
  if (s.report.products.length === 0) {
    paragraph("No products are set up for your organisation.");
  } else {
    table(
      ["Product", "Raised", "Resolved", "Open at month end", "First response within target", "Resolved within target", "Rated good"],
      s.report.products.map((p) => [
        p.name,
        String(p.figures.created),
        String(p.figures.resolved),
        String(p.figures.open),
        pct(p.figures.firstResponseWithinTarget),
        pct(p.figures.resolvedWithinTarget),
        pct(p.figures.ratedGood),
      ]),
      [0.22, 0.1, 0.13, 0.13, 0.15, 0.14, 0.13],
    );
  }

  heading("H2", "Service notices");
  if (s.notices.length === 0) {
    paragraph("There were no incidents or planned maintenance affecting your products this month.");
  } else {
    const list = doc.struct("L");
    root.add(list);
    for (const n of s.notices) {
      ensureSpace(24);
      const text = `${noticeKindLabels[n.kind]}: ${n.title} (from ${dateFmt.format(n.startsAt)}${n.resolvedAt ? `, resolved ${dateFmt.format(n.resolvedAt)}` : ", ongoing"})`;
      const item = doc.struct("LI");
      list.add(item);
      item.add(
        doc.struct("Lbl", {}, () => {
          doc.font("Sans").fontSize(10).fillColor(INK).text("•", left, doc.y, { continued: false, width: 12 });
        }),
      );
      doc.moveUp();
      item.add(
        doc.struct("LBody", {}, () => {
          doc.font("Sans").fontSize(10).fillColor(INK).text(text, left + 14, doc.y, { width: width - 14 });
        }),
      );
      item.end();
      doc.moveDown(0.3);
    }
    list.end();
    doc.x = left;
  }

  heading("H2", "Your service targets");
  table(
    ["Priority", "First response", "Resolution"],
    s.targets.map((t) => [t.priority, describeTarget(t.firstResponseMinutes), describeTarget(t.resolutionMinutes)]),
    [0.4, 0.3, 0.3],
  );

  paragraph(`Questions about this summary? Reply to the email or raise a ticket at ${brand.supportEmail}.`, { muted: true, size: 9 });

  root.end();

  // Page numbers, marked as pagination artifacts so assistive technology skips them.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Writing inside the bottom margin would otherwise start a new page.
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.markContent("Artifact", { type: "Pagination" });
    doc
      .font("Sans")
      .fontSize(8)
      .fillColor(MUTED)
      .text(`${s.organization} · ${s.label} · Page ${i + 1} of ${range.count}`, left, doc.page.height - 40, { width, align: "center", lineBreak: false });
    doc.endMarkedContent();
    doc.page.margins.bottom = savedBottom;
  }

  doc.end();
  return done;
}

// ---- Sending -------------------------------------------------------------------

/** Client admins of the organisation, plus every s6a admin. */
export async function monthlyRecipients(organizationId: string) {
  const people = await db.user.findMany({
    where: {
      active: true,
      OR: [{ organizationId, role: "CLIENT", orgAdmin: true }, { role: "ADMIN" }],
    },
    select: { email: true, role: true },
  });
  return [...new Map(people.map((p) => [p.email, p])).values()];
}

/**
 * Sends one client's summary for a month, at most once: the run is recorded
 * first, so a retry or a second cron invocation can't send it twice.
 */
export async function sendMonthlySummary(organizationId: string, year: number, month: number) {
  const key = monthKey(year, month);
  const recipients = await monthlyRecipients(organizationId);
  try {
    await db.monthlyReportRun.create({ data: { organizationId, month: key, recipients: recipients.length } });
  } catch {
    return { sent: 0, skipped: "already-sent" as const };
  }

  const summary = await buildMonthlySummary(organizationId, year, month);
  const pdf = await renderMonthlyPdf(summary);
  const { renderEmail } = await import("./email/templates");
  const { sendEmail } = await import("./email/send");
  const { appUrl } = await import("./config");
  const filename = `${summary.slug}-support-summary-${key}.pdf`;

  let sent = 0;
  for (const r of recipients) {
    const { text, html } = renderEmail({
      heading: `${summary.organization}: support summary for ${summary.label}`,
      bodyText: summaryText(summary),
      action: r.role === "CLIENT" ? { label: "View reports", url: appUrl("/reports") } : { label: "Open client", url: appUrl(`/admin/organizations/${organizationId}`) },
    });
    try {
      await sendEmail({
        to: r.email,
        subject: `${summary.organization}: support summary for ${summary.label}`,
        text,
        html,
        attachments: [{ filename, contentType: "application/pdf", content: pdf }],
      });
      sent++;
    } catch (err) {
      console.error(`Monthly summary for ${organizationId} to ${r.email} failed`, err);
    }
  }
  return { sent };
}
