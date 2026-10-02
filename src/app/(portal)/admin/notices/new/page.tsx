import Link from "next/link";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { Flash } from "@/components/flash";
import { NoticeForm } from "@/components/notice-form";
import { createNotice } from "../actions";

export const metadata = { title: "New service notice" };

export default async function NewNoticePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireStaff();
  const { error } = await searchParams;
  const products = await db.product.findMany({
    orderBy: [{ organization: { name: "asc" } }, { name: "asc" }],
    select: { id: true, name: true, organization: { select: { name: true } } },
  });
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/notices" className="text-sm link">
        <span aria-hidden="true">← </span>Service notices
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">New service notice</h1>
      <Flash error={error} />
      <NoticeForm action={createNotice} products={products} />
    </div>
  );
}
