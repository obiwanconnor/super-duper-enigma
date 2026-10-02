import { redirect, notFound } from "next/navigation";
import { auth } from "./auth";
import { isAdmin, isStaff, type Viewer } from "./access";
import { checkIdleSession } from "./idle-session";

export async function currentViewer(): Promise<(Viewer & { name: string | null; email: string; orgAdmin: boolean }) | null> {
  if ((await checkIdleSession()) === "timed-out") return null;
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    role: session.user.role,
    organizationId: session.user.organizationId,
    orgAdmin: session.user.orgAdmin,
    name: session.user.name ?? null,
    email: session.user.email ?? "",
  };
}

export async function requireViewer() {
  const idle = await checkIdleSession();
  if (idle === "timed-out") redirect("/login?error=timeout");
  const viewer = await currentViewer();
  if (!viewer) redirect("/login");
  return viewer;
}

/** Client admins manage their own organisation's people and see its reports. */
export async function requireClientAdmin() {
  const viewer = await requireViewer();
  if (viewer.role !== "CLIENT" || !viewer.orgAdmin || !viewer.organizationId) notFound();
  return { ...viewer, organizationId: viewer.organizationId };
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
