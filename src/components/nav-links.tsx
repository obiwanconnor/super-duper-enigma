"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Primary navigation; marks the current section with aria-current. */
export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <ul className="flex flex-wrap gap-x-1 gap-y-1 text-sm">
      {items.map((n) => {
        const current = pathname === n.href || pathname.startsWith(`${n.href}/`);
        return (
          <li key={n.href}>
            <Link
              href={n.href}
              aria-current={current ? "page" : undefined}
              className={`inline-flex min-h-8 items-center rounded-md px-2 ${
                current ? "bg-brand-50 font-semibold text-brand-700" : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {n.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
