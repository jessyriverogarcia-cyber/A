import { redirect } from "next/navigation";
import { sectorConfig } from "@/config/sector.config";

export const dynamic = "force-dynamic";

/** Après connexion, la Map vivante du premier site est la page d'accueil. */
export default function Home() {
  redirect(`/map/${sectorConfig.sites[0].id}`);
}
