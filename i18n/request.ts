import { getRequestConfig } from "next-intl/server";
import { sectorConfig } from "@/config/sector.config";

/** Langue unique pilotée par la fiche secteur (fr-FR → fr). */
export default getRequestConfig(async () => {
  const locale = sectorConfig.company.locale.split("-")[0];
  return {
    locale,
    timeZone: sectorConfig.company.timezone,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
