import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { sectorConfig } from "@/config/sector.config";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: sectorConfig.company.name, template: `%s · ${sectorConfig.company.name}` },
  description: sectorConfig.company.sector,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} style={{ "--accent": sectorConfig.company.accentColor } as React.CSSProperties}>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
