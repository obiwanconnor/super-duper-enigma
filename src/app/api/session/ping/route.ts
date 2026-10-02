import { NextResponse } from "next/server";
import { checkIdleSession } from "@/lib/idle-session";

/** Called by the idle warning's "Stay signed in" and on user activity. */
export async function POST() {
  const state = await checkIdleSession();
  return NextResponse.json({ active: state === "active" }, { status: state === "active" ? 200 : 401, headers: { "Cache-Control": "no-store" } });
}
