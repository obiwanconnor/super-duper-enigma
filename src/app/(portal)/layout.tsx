import Link from "next/link";
import { brand } from "@/lib/config";
import { signOut } from "@/lib/auth";
import { isAdmin, isStaff } from "@/lib/access";
import { requireViewer } from "@/lib/session";
import { db } from "@/lib/db";
import { NavLinks } from "@/components/nav-links";
import { SiteFooter } from "@/components/site-footer";
import { SkipLink } from "@/components/skip-link";
import { IdleWatcher } from "@/components/idle-watcher";
import { NoticeBanner } from "@/components/notice-banner";
import { idleLimitMinutes, warningMinutes } from "@/lib/idle";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  const org = viewer.organizationId
    ? await db.organization.findUnique({ where: { id: viewer.organizationId }, select: { name: true } })
    : null;

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  const nav = [
    ...(isStaff(viewer) ? [{ href: "/dashboard", label: "Dashboard" }] : []),
    { href: "/tickets", label: "Tickets" },
    { href: "/kb", label: "Knowledge base" },
    ...(viewer.role === "CLIENT" && viewer.orgAdmin
      ? [
          { href: "/team", label: "Team" },
          { href: "/reports", label: "Reports" },
        ]
      : []),
    ...(isStaff(viewer)
      ? [
          { href: "/admin/articles", label: "Articles" },
          { href: "/admin/canned", label: "Saved replies" },
          { href: "/admin/notices", label: "Notices" },
        ]
      : []),
    ...(isAdmin(viewer)
      ? [
          { href: "/admin/organizations", label: "Clients" },
          { href: "/admin/staff", label: "Staff" },
          { href: "/admin/audit", label: "Audit log" },
          { href: "/admin/retention", label: "Retention" },
        ]
      : []),
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink />
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href={isStaff(viewer) ? "/dashboard" : "/tickets"} className="flex min-h-8 items-center gap-2 font-semibold">
            <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-xs font-bold text-white">
              s6a
            </span>
            <span>{brand.shortName}</span>
          </Link>
          <nav aria-label="Main">
            <NavLinks items={nav} />
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-slate-600 md:inline">
              {viewer.name ?? viewer.email}
              {org ? ` · ${org.name}` : isStaff(viewer) ? " · Staff" : ""}
            </span>
            <form action={logout}>
              <button className="inline-flex min-h-8 items-center rounded-md px-2 text-slate-700 hover:bg-slate-100 hover:text-slate-900">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <NoticeBanner viewer={viewer} />
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 focus:outline-none">
        {children}
      </main>
      <SiteFooter signedIn />
      <IdleWatcher limitMinutes={idleLimitMinutes(viewer.role)} warnMinutes={warningMinutes(idleLimitMinutes(viewer.role))} signOutAction={logout} />
    </div>
  );
}
