"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn } from "@/lib/auth";
import { normaliseEmail } from "@/lib/login-policy";

function safeCallback(raw: FormDataEntryValue | null): string {
  const v = typeof raw === "string" ? raw : "";
  return v.startsWith("/") && !v.startsWith("//") ? v : "/tickets";
}

export async function continueWithEmail(formData: FormData) {
  const parsed = z.string().email().safeParse(String(formData.get("email") ?? "").trim());
  const callbackUrl = safeCallback(formData.get("callbackUrl"));
  if (!parsed.success) {
    redirect(`/login?error=invalid-email&callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }
  redirect(`/login?email=${encodeURIComponent(normaliseEmail(parsed.data))}&callbackUrl=${encodeURIComponent(callbackUrl)}`);
}

export async function signInWith(formData: FormData) {
  const providerId = String(formData.get("providerId") ?? "");
  const email = normaliseEmail(String(formData.get("email") ?? ""));
  const redirectTo = safeCallback(formData.get("callbackUrl"));

  if (providerId === "sendgrid") {
    // Redirect ourselves: the client router doesn't follow Auth.js's extra
    // verify-request hop after a server action.
    const result: unknown = await signIn("sendgrid", { email, redirectTo, redirect: false });
    const url = typeof result === "string" ? new URL(result, "http://local") : null;
    const error = url?.searchParams.get("error");
    redirect(error ? `/login?error=${encodeURIComponent(error)}&email=${encodeURIComponent(email)}` : "/login/check-email");
  } else {
    await signIn(providerId, { redirectTo }, { login_hint: email });
  }
}
