import { describe, expect, it } from "vitest";
import { checkAuthSettings, checkEnv } from "@/lib/deploy/checks";

const PROD = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  NEXT_PUBLIC_SITE_URL: "https://gestion.exemple.test",
  NEXT_PUBLIC_DEMO_MODE: "false",
  INTEGRATIONS_SECRET: "x".repeat(48),
  MS_CLIENT_ID: "id",
  MS_CLIENT_SECRET: "secret",
  CRON_SECRET: "c".repeat(32),
  ANTHROPIC_API_KEY: "k",
};
const errors = (env: Record<string, string>) => checkEnv(env).filter((c) => c.level === "error").map((c) => c.key);

describe("checkEnv", () => {
  it("accepte une configuration de production complète", () => {
    expect(errors(PROD)).toEqual([]);
  });

  it("refuse la démo, l'instance locale et une URL avec « / » final", () => {
    expect(errors({ ...PROD, NEXT_PUBLIC_DEMO_MODE: "true" })).toContain("NEXT_PUBLIC_DEMO_MODE");
    expect(errors({ ...PROD, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" })).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(errors({ ...PROD, NEXT_PUBLIC_SITE_URL: "https://gestion.exemple.test/" })).toContain("NEXT_PUBLIC_SITE_URL");
  });

  it("exige les secrets dès qu'une messagerie est configurée, sinon simple avertissement", () => {
    expect(errors({ ...PROD, INTEGRATIONS_SECRET: "", CRON_SECRET: "" })).toEqual(["INTEGRATIONS_SECRET", "CRON_SECRET"]);
    const noMail = { ...PROD, MS_CLIENT_ID: "", MS_CLIENT_SECRET: "", INTEGRATIONS_SECRET: "", CRON_SECRET: "" };
    expect(errors(noMail)).toEqual([]);
    expect(checkEnv(noMail).filter((c) => c.level === "warn").map((c) => c.key)).toContain("CRON_SECRET");
    expect(errors({ ...PROD, MS_CLIENT_SECRET: "" })).toContain("MS_CLIENT_SECRET");
  });

  it("refuse un secret exposé au navigateur et une clé service identique à la clé anon", () => {
    expect(errors({ ...PROD, NEXT_PUBLIC_ANTHROPIC_API_KEY: "k" })).toContain("NEXT_PUBLIC_ANTHROPIC_API_KEY");
    expect(errors({ ...PROD, SUPABASE_SERVICE_ROLE_KEY: "anon" })).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});

describe("checkAuthSettings", () => {
  it("exige l'inscription fermée et les fournisseurs SSO déclarés", () => {
    const lv = (s: Parameters<typeof checkAuthSettings>[0], p: string[]) => checkAuthSettings(s, p).map((c) => c.level);
    expect(lv({ disable_signup: true, external: { azure: true } }, ["azure"])).toEqual(["ok", "ok"]);
    expect(lv({ disable_signup: false, external: {} }, ["google"])).toEqual(["error", "error"]);
  });
});
