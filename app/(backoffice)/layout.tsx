import { AppShell } from "@/components/shell/AppShell";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const ctx = await requireUser();
  return <AppShell ctx={ctx}>{children}</AppShell>;
}
