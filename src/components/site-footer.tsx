import Link from "next/link";
import { brand } from "@/lib/config";
import { ThemeSwitcher } from "./theme-switcher";

/** Same help and policy links, in the same place, on every page (WCAG 3.2.6). */
export function SiteFooter({ signedIn }: { signedIn: boolean }) {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-6 px-4 py-6 text-sm text-slate-600">
        <div>
          <h2 className="font-semibold text-slate-800">Need help?</h2>
          <p className="mt-1">
            {signedIn ? (
              <>
                <Link href="/tickets/new" className="link">
                  Raise a ticket
                </Link>{" "}
                or email{" "}
              </>
            ) : (
              "Email "
            )}
            <a href={`mailto:${brand.supportEmail}`} className="link">
              {brand.supportEmail}
            </a>
          </p>
        </div>
        <nav aria-label="Policies">
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            <li>
              <Link href="/accessibility" className="link">
                Accessibility statement
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="link">
                Privacy notice
              </Link>
            </li>
          </ul>
        </nav>
        <ThemeSwitcher />
      </div>
    </footer>
  );
}
