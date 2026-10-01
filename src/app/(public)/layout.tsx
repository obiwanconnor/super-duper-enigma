import Link from "next/link";
import { brand } from "@/lib/config";
import { auth } from "@/lib/auth";
import { SiteFooter } from "@/components/site-footer";
import { SkipLink } from "@/components/skip-link";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink />
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href={session ? "/tickets" : "/login"} className="flex items-center gap-2 font-semibold">
            <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-xs font-bold text-white">
              s6a
            </span>
            {brand.shortName}
          </Link>
          <Link href={session ? "/tickets" : "/login"} className="link text-sm">
            {session ? "Back to tickets" : "Sign in"}
          </Link>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 focus:outline-none">
        <article className="prose-kb">{children}</article>
      </main>
      <SiteFooter signedIn={!!session} />
    </div>
  );
}
