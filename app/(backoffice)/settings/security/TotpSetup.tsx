"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Input } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/client";

type Enrollment = { factorId: string; qr: string; secret: string };

export function TotpSetup() {
  const t = useTranslations("security");
  const [verifiedId, setVerifiedId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const { data } = await createClient().auth.mfa.listFactors();
    setVerifiedId(data?.totp.find((f) => f.status === "verified")?.id ?? null);
  }
  useEffect(() => {
    refresh();
  }, []);

  async function enroll() {
    setError(null);
    const supabase = createClient();
    // Nettoie un éventuel enrôlement inachevé avant d'en créer un nouveau.
    const { data: factors } = await supabase.auth.mfa.listFactors();
    for (const f of factors?.all ?? []) if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `totp-${Date.now()}` });
    if (error) return setError(error.message);
    setEnrollment({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function verify(form: FormData) {
    if (!enrollment) return;
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId: enrollment.factorId, code: String(form.get("code")) });
    if (error) return setError(error.message);
    setEnrollment(null);
    refresh();
  }

  async function disable() {
    if (!verifiedId) return;
    const { error } = await createClient().auth.mfa.unenroll({ factorId: verifiedId });
    if (error) return setError(error.message);
    refresh();
  }

  if (verifiedId)
    return (
      <div className="flex items-center justify-between">
        <Badge tone="ok">● {t("enabled")}</Badge>
        <Button variant="secondary" onClick={disable}>{t("disable")}</Button>
      </div>
    );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">{t("totpHint")}</p>
      {enrollment ? (
        <form action={verify} className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enrollment.qr} alt="QR code TOTP" className="h-44 w-44 rounded-lg bg-white p-2" />
          <code className="block text-xs break-all text-muted">{enrollment.secret}</code>
          <Input name="code" inputMode="numeric" maxLength={6} placeholder="123456" required />
          <Button type="submit">{t("verify")}</Button>
        </form>
      ) : (
        <Button onClick={enroll}>{t("enroll")}</Button>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
