import Link from "next/link";
import { brand } from "@/lib/config";
import { signOut } from "@/lib/auth";
import { isAdmin, isStaff } from "@/lib/access";
import { requireViewer } from "@/lib/session";
import { db } from "@/lib/db";

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
    { href: "/tickets", label: "Tickets" },
    { href: "/kb", label: "Knowledge base" },
    ...(isStaff(viewer) ? [{ href: "/admin/articles", label: "Articles" }] : []),
    ...(isAdmin(viewer) ? [{ href: "/admin/organizations", label: "Clients" }, { href: "/admin/staff", label: "Staff" }] : []),
  ];

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/tickets" className="flex items-center gap-2 font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-xs font-bold text-white">s6a</span>
            <span className="hidden sm:inline">{brand.shortName}</span>
          </Link>
          <nav className="flex flex-wrap gap-4 text-sm">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="text-slate-600 hover:text-slate-900">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-slate-500 md:inline">
              {viewer.name ?? viewer.email}
              {org ? ` · ${org.name}` : isStaff(viewer) ? " · Staff" : ""}
            </span>
            <form action={logout}>
              <button className="text-slate-600 hover:text-slate-900">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
