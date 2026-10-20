import { getTranslations } from "next-intl/server";
import { sectorConfig } from "@/config/sector.config";
import { Card, Logo } from "@/components/ui/primitives";
import { DEMO_ACCOUNTS, isDemoMode } from "@/lib/demo";
import { LoginForm, MfaForm } from "./forms";
import { signInDemo } from "./actions";

export const metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const t = await getTranslations("login");
  const next = params.next ?? "/";
  const roleLabel = (key: string) => sectorConfig.roles.find((r) => r.id === key)?.label ?? key;

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-[#0e1116] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(circle at 70% 30%, color-mix(in srgb, var(--accent) 45%, transparent), transparent 55%), radial-gradient(circle at 20% 80%, rgb(14 165 233 / 0.35), transparent 50%)",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              "linear-gradient(rgb(255 255 255 / 0.6) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.6) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
            transform: "perspective(600px) rotateX(55deg) scale(1.6) translateY(10%)",
          }}
        />
        <div className="relative flex items-center gap-3">
          <Logo size={44} />
          <span className="text-xl font-semibold">{sectorConfig.company.name}</span>
        </div>
        <div className="relative max-w-md">
          <p className="text-3xl leading-tight font-semibold">{sectorConfig.company.sector}</p>
          <p className="mt-4 text-white/70">
            {sectorConfig.sites.map((s) => s.label).join(" · ")} — {sectorConfig.company.city}
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="flex items-center gap-3 lg:hidden">
            <Logo />
            <span className="text-lg font-semibold">{sectorConfig.company.name}</span>
          </div>
          <div>
            <h1 className="text-2xl font-semibold">{params.mfa ? t("mfaTitle") : t("title")}</h1>
            <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
          </div>

          {params.mfa ? <MfaForm next={next} /> : <LoginForm next={next} error={params.error} />}

          {isDemoMode() && !params.mfa && (
            <Card className="p-4">
              <p className="text-sm font-semibold">{t("demoAccounts")}</p>
              <p className="mb-3 text-xs text-muted">{t("demoHint")}</p>
              <form action={signInDemo} className="grid grid-cols-3 gap-2">
                <input type="hidden" name="next" value={next} />
                {DEMO_ACCOUNTS.map((a) => (
                  <button
                    key={a.login}
                    name="login"
                    value={a.login}
                    data-testid={`demo-${a.login}`}
                    className="rounded-lg border border-border bg-surface-2 px-2 py-2 text-xs font-medium hover:border-accent hover:text-accent"
                  >
                    {roleLabel(a.role)}
                  </button>
                ))}
              </form>
            </Card>
          )}
        </div>
      </section>
    </main>
  );
}
