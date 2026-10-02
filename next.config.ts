import type { NextConfig } from "next";
import { STATIC_SECURITY_HEADERS } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "pdfkit"],
  // Fonts embedded in the monthly PDF summaries.
  outputFileTracingIncludes: {
    "/reports/monthly/[month]": ["./assets/fonts/*.ttf"],
    "/api/cron/monthly-reports": ["./assets/fonts/*.ttf"],
  },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: STATIC_SECURITY_HEADERS }];
  },
  experimental: {
    // Attachments are capped at 4 MB per message (Vercel's request limit is 4.5 MB).
    serverActions: { bodySizeLimit: "4.5mb" },
  },
};

export default nextConfig;
