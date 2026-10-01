import { SiteFooter } from "@/components/site-footer";
import { SkipLink } from "@/components/skip-link";

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink />
      <main id="main" tabIndex={-1} className="flex flex-1 items-center justify-center px-4 py-10 focus:outline-none">
        {children}
      </main>
      <SiteFooter signedIn={false} />
    </div>
  );
}
