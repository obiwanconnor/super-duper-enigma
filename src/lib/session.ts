import { redirect, notFound } from "next/navigation";
import { auth } from "./auth";
import { isAdmin, isStaff, type Viewer } from "./access";

export async function currentViewer(): Promise<(Viewer & { name: string | null; email: string }) | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    role: session.user.role,
    organizationId: session.user.organizationId,
    name: session.user.name ?? null,
    email: session.user.email ?? "",
  };
}

export async function requireViewer() {
  const viewer = await currentViewer();
  if (!viewer) redirect("/login");
  return viewer;
}

export async function requireStaff() {
  const viewer = await requireViewer();
  if (!isStaff(viewer)) notFound();
  return viewer;
}

export async function requireAdmin() {
  const viewer = await requireViewer();
  if (!isAdmin(viewer)) notFound();
  return viewer;
}
