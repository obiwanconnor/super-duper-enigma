import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { brand } from "@/lib/config";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s · ${brand.shortName}` },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // An explicit choice is applied on the server, so pages never flash the wrong theme.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="en-GB" data-theme={theme === "system" ? undefined : theme}>
      <body>{children}</body>
    </html>
  );
}
