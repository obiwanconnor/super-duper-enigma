import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { Flash } from "@/components/flash";
import { SubmitButton } from "@/components/submit-button";
import { deleteCannedResponse } from "../../actions";
import { CannedForm } from "../form";

export const metadata = { title: "Edit saved reply" };

export default async function EditCannedPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  await requireStaff();
  const item = await db.cannedResponse.findUnique({ where: { id: (await params).id } });
  if (!item) notFound();
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/admin/canned" className="text-sm link">
        ← Saved replies
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">Edit saved reply</h1>
      <Flash error={error} />
      <div className="card p-6">
        <CannedForm item={item} />
      </div>
      <form action={deleteCannedResponse} className="mt-4 text-right">
        <input type="hidden" name="id" value={item.id} />
        <SubmitButton className="btn-danger" pendingText="Deleting…">
          Delete saved reply
        </SubmitButton>
      </form>
    </div>
  );
}
