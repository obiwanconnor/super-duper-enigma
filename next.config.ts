import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client"],
  experimental: {
    // Attachments are capped at 4 MB per message (Vercel's request limit is 4.5 MB).
    serverActions: { bodySizeLimit: "4.5mb" },
  },
};

export default nextConfig;
