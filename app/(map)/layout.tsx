import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** La Map est plein écran : pas de menu latéral, le HUD donne accès au back-office. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return children;
}
