"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, Input } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/client";
import { sendMagicLink, signInWithPassword } from "./actions";

const SSO: { id: "azure" | "google"; label: string }[] = [
  { id: "azure", label: "Microsoft" },
  { id: "google", label: "Google" },
];

export function LoginForm({ next, error, ssoProviders = [] }: { next: string; error?: string; ssoProviders?: string[] }) {
  const t = useTranslations("login");
  const [pwState, pwAction, pwPending] = useActionState(signInWithPassword, undefined);
  const [mlState, mlAction, mlPending] = useActionState(sendMagicLink, undefined);
  const [email, setEmail] = useState("");

  return (
    <div className="space-y-4">
      <form action={pwAction} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        <label className="block space-y-1 text-sm">
          <span>{t("email")}</span>
          <Input name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block space-y-1 text-sm">
          <span>{t("password")}</span>
          <Input name="password" type="password" autoComplete="current-password" required />
        </label>
        {(pwState?.error || (error && error !== "no_access")) && <p className="text-sm text-danger">{t("error")}</p>}
        <Button type="submit" className="w-full" disabled={pwPending}>
          {t("submit")}
        </Button>
      </form>

      <form action={mlAction} className="space-y-2">
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="email" value={email} />
        <Button type="submit" variant="secondary" className="w-full" disabled={mlPending || !email}>
          {t("magicLink")}
        </Button>
        {mlState?.info && (
          <p className="text-xs text-ok">
            {t("magicLinkSent")} <span className="text-muted">{t("magicLinkLocal")}</span>
          </p>
        )}
      </form>

      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-border" />
        {t("or")}
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {SSO.map((p) =>
          ssoProviders.includes(p.id) ? (
            <Button
              key={p.id}
              variant="secondary"
              data-testid={`sso-${p.id}`}
              onClick={() =>
                // Connexion déléguée à Supabase Auth ; seuls les comptes invités ont accès (profil requis).
                createClient().auth.signInWithOAuth({ provider: p.id, options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`, scopes: p.id === "azure" ? "email" : undefined } })
              }
            >
              {t("sso", { provider: p.label })}
            </Button>
          ) : (
            <Button key={p.id} variant="secondary" disabled title={t("ssoNotConfigured")} className="flex-col gap-0 py-1.5" data-testid={`sso-${p.id}`}>
              <span>{t("sso", { provider: p.label })}</span>
              <Badge tone="warn" className="mt-0.5">
                {t("ssoNotConfigured")}
              </Badge>
            </Button>
          ),
        )}
      </div>
    </div>
  );
}

export function MfaForm({ next }: { next: string }) {
  const t = useTranslations("login");
  const router = useRouter();
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);

  async function verify(form: FormData) {
    setPending(true);
    const supabase = createClient();
    const { data } = await supabase.auth.mfa.listFactors();
    const factor = data?.totp.find((f) => f.status === "verified");
    const res = factor
      ? await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: String(form.get("code")) })
      : { error: new Error("no factor") };
    setPending(false);
    if (res.error) return setError(true);
    router.replace(next);
    router.refresh();
  }

  return (
    <form action={verify} className="space-y-3">
      <label className="block space-y-1 text-sm">
        <span>{t("mfaCode")}</span>
        <Input name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required autoFocus />
      </label>
      {error && <p className="text-sm text-danger">{t("error")}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {t("mfaSubmit")}
      </Button>
    </form>
  );
}
