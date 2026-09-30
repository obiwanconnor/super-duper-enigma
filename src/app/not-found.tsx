import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-sm text-slate-500">It may have moved, or you may not have access to it.</p>
      <Link href="/tickets" className="link text-sm">
        Go to tickets
      </Link>
    </main>
  );
}
