import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseWs = supabase.replace(/^http/, "ws");

// En-têtes de sécurité : pas d'intégration dans un cadre tiers, pas de fuite de l'URL,
// capteurs désactivés, connexions limitées à l'application et à Supabase.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js injecte des scripts en ligne ; three.js compile ses shaders (pas d'eval)
      "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: ${supabase}`,
      "font-src 'self' data:",
      `connect-src 'self' ${supabase} ${supabaseWs}`,
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self' https://login.microsoftonline.com https://accounts.google.com",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["@react-pdf/renderer"],
  // Polices et profil de couleur lus à l'exécution par la génération des PDF (PDF/A-3)
  outputFileTracingIncludes: { "/**": ["./assets/fonts/**", "./assets/icc/**"] },
  // Dépôt de documents (plans, certificats) par Server Action : 20 Mo comme le bucket.
  experimental: { serverActions: { bodySizeLimit: "21mb" } },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
