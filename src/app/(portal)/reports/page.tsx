import Link from "next/link";
import { db } from "@/lib/db";
import { requireClientAdmin } from "@/lib/session";
import { organizationReport, type ReportFigures } from "@/lib/reports";
import { formatBusinessDuration } from "@/lib/sla/business-time";
import { availableMonths } from "@/lib/monthly-report";

export const metadata = { title: "Reports" };

const PERIODS = [30, 90, 365] as const;

const dur = (m: number | null) => (m === null ? "—" : formatBusinessDuration(m));
const pct = (p: number | null) => (p === null ? "—" : `${p}%`);

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const admin = await requireClientAdmin();
  const requested = Number((await searchParams).days);
  const days = PERIODS.includes(requested as (typeof PERIODS)[number]) ? requested : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60_000);
  const [org, report] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: admin.organizationId }, select: { name: true, createdAt: true } }),
    organizationReport(admin.organizationId, since),
  ]);
  const o = report.overall;
  const months = availableMonths(org.createdAt);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-slate-600">Support for {org.name} over the last {days} days. Times are in business hours.</p>
        </div>
        <nav aria-label="Report period" className="flex gap-1 text-sm">
          {PERIODS.map((d) => (
            <Link
              key={d}
              href={`?days=${d}`}
              aria-current={days === d ? "page" : undefined}
              className={`inline-flex min-h-8 items-center rounded-md px-3 ${days === d ? "bg-brand-600 text-white" : "text-slate-700 hover:bg-slate-100"}`}
            >
              {d === 365 ? "Last 12 months" : `Last ${d} days`}
            </Link>
          ))}
        </nav>
      </div>

      <section aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="sr-only">
          Summary
        </h2>
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Tickets raised" value={String(o.created)} />
          <Stat label="Tickets resolved" value={String(o.resolved)} />
          <Stat label="Open now" value={String(o.open)} />
          <Stat label="Rated good" value={pct(o.ratedGood)} sub={`${o.ratings} ${o.ratings === 1 ? "rating" : "ratings"}`} />
          <Stat label="Median first response" value={dur(o.medianFirstResponse)} />
          <Stat label="First response within target" value={pct(o.firstResponseWithinTarget)} />
          <Stat label="Median time to resolve" value={dur(o.medianResolution)} sub="excludes time waiting on you" />
          <Stat label="Resolved within target" value={pct(o.resolvedWithinTarget)} />
        </dl>
      </section>

      <section aria-labelledby="products-heading">
        <h2 id="products-heading" className="mb-3 text-lg font-semibold">
          By product
        </h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Support figures per product for the last {days} days</caption>
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-3">Product</th>
                <th scope="col" className="px-4 py-3 text-right">Raised</th>
                <th scope="col" className="px-4 py-3 text-right">Resolved</th>
                <th scope="col" className="px-4 py-3 text-right">Open</th>
                <th scope="col" className="px-4 py-3 text-right">First response within target</th>
                <th scope="col" className="px-4 py-3 text-right">Resolved within target</th>
                <th scope="col" className="px-4 py-3 text-right">Rated good</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.products.map((p) => (
                <ProductRow key={p.id} name={p.name} f={p.figures} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="monthly-heading" className="card p-5">
        <h2 id="monthly-heading" className="mb-1 font-semibold">
          Monthly summaries
        </h2>
        <p className="mb-3 text-sm text-slate-600">
          An accessible PDF summary is emailed to your organisation&apos;s admins on the first working day of each month. Download past months here.
        </p>
        {months.length === 0 ? (
          <p className="text-sm text-slate-600">Your first summary will be available after your first full month.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {months.map((m) => (
              <li key={m.key}>
                <a href={`/reports/monthly/${m.key}`} className="btn-secondary py-1.5" download aria-label={`Download summary for ${m.label} (PDF)`}>
                  {m.label}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="export-heading" className="card p-5">
        <h2 id="export-heading" className="mb-1 font-semibold">
          Download tickets
        </h2>
        <p className="mb-3 text-sm text-slate-600">A spreadsheet (CSV) of every ticket raised by {org.name} in this period, with response times and ratings.</p>
        <a href={`/reports/export?days=${days}`} className="btn-secondary" download>
          Download CSV
        </a>
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <dt className="text-xs font-medium text-slate-600">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
      {sub && <dd className="mt-1 text-xs text-slate-600">{sub}</dd>}
    </div>
  );
}

function ProductRow({ name, f }: { name: string; f: ReportFigures }) {
  return (
    <tr>
      <th scope="row" className="px-4 py-2 text-left font-medium">
        {name}
      </th>
      <td className="px-4 py-2 text-right tabular-nums">{f.created}</td>
      <td className="px-4 py-2 text-right tabular-nums">{f.resolved}</td>
      <td className="px-4 py-2 text-right tabular-nums">{f.open}</td>
      <td className="px-4 py-2 text-right tabular-nums">{pct(f.firstResponseWithinTarget)}</td>
      <td className="px-4 py-2 text-right tabular-nums">{pct(f.resolvedWithinTarget)}</td>
      <td className="px-4 py-2 text-right tabular-nums">{pct(f.ratedGood)}</td>
    </tr>
  );
}
