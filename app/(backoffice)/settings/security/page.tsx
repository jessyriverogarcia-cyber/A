import { getTranslations } from "next-intl/server";
import { Card, CardTitle } from "@/components/ui/primitives";
import { TotpSetup } from "./TotpSetup";

export const metadata = { title: "Sécurité du compte" };

export default async function SecurityPage() {
  const t = await getTranslations("security");
  return (
    <div className="max-w-xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <Card>
        <CardTitle>{t("totp")}</CardTitle>
        <TotpSetup />
      </Card>
    </div>
  );
}
