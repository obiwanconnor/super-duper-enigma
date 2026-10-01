"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";

export async function setTheme(formData: FormData) {
  const theme = parseTheme(String(formData.get("theme") ?? ""));
  const jar = await cookies();
  if (theme === "system") jar.delete(THEME_COOKIE);
  else jar.set(THEME_COOKIE, theme, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: false });

  // Return to the page the person was on.
  const referer = (await headers()).get("referer");
  let back = "/";
  if (referer) {
    const url = new URL(referer);
    back = `${url.pathname}${url.search}`;
  }
  redirect(back);
}
