import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@react-pdf/renderer"],
  // Dépôt de documents (plans, certificats) par Server Action : 20 Mo comme le bucket.
  experimental: { serverActions: { bodySizeLimit: "21mb" } },
};

export default withNextIntl(nextConfig);
