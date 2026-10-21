import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  process.env.INTEGRATIONS_SECRET = "x".repeat(40);
  process.env.MS_CLIENT_ID = "ms-client";
  process.env.MS_CLIENT_SECRET = "ms-secret";
  process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.test";
});
afterEach(() => vi.unstubAllGlobals());

describe("jetons chiffrés", () => {
  it("chiffre, déchiffre et refuse un texte altéré", async () => {
    const { open, seal } = await import("@/lib/integrations/crypto");
    const t = { access_token: "secret-access", refresh_token: "r", expires_at: 1 };
    const s = seal(t);
    expect(s).not.toContain("secret-access");
    expect(open(s)).toEqual(t);
    const parts = s.split(".");
    parts[3] = Buffer.from("autre chose").toString("base64url");
    expect(() => open(parts.join("."))).toThrow();
  });

  it("PKCE : défi S256 dérivé du vérificateur", async () => {
    const { pkce } = await import("@/lib/integrations/crypto");
    const { createHash } = await import("node:crypto");
    const p = pkce();
    expect(p.challenge).toBe(createHash("sha256").update(p.verifier).digest("base64url"));
  });
});

describe("OAuth", () => {
  it("construit l'URL d'autorisation Microsoft avec état, PKCE et URL de retour", async () => {
    const { authorizeUrl, configured } = await import("@/lib/integrations/oauth");
    expect(configured("microsoft")).toBe(true);
    expect(configured("google")).toBe(false); // pas d'identifiants Google
    const u = new URL(authorizeUrl("microsoft", "etat123", "defi456"));
    expect(u.origin + u.pathname).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    expect(u.searchParams.get("state")).toBe("etat123");
    expect(u.searchParams.get("code_challenge")).toBe("defi456");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("redirect_uri")).toBe("https://app.example.test/settings/integrations/microsoft/callback");
    expect(u.searchParams.get("scope")).toContain("Mail.Send");
  });
});

describe("MIME", () => {
  it("encode le sujet accentué et joint les fichiers en base64", async () => {
    const { buildMime } = await import("@/lib/integrations/mime");
    const m = buildMime({ to: "a@b.test", subject: "Devis — pièce", body: "Bonjour", attachments: [{ name: "DEV-1.pdf", mime: "application/pdf", data: Buffer.from("%PDF") }] });
    expect(m).toContain("Subject: =?UTF-8?B?");
    expect(m).toContain('Content-Disposition: attachment; filename="DEV-1.pdf"');
    expect(m).toContain(Buffer.from("%PDF").toString("base64"));
    expect(m).toMatch(/--sf_\w+--$/);
  });
});

describe("envoi réel", () => {
  /** Faux client Supabase : jeton chiffré en RPC, fil existant, insertion du message archivé. */
  async function fakeDb(expiresIn = 3_600_000) {
    const { seal } = await import("@/lib/integrations/crypto");
    const inserted: unknown[] = [];
    const db = {
      rpc: vi.fn(async (name: string) => (name === "integration_secret" ? { data: seal({ access_token: "tok", refresh_token: "ref", expires_at: Date.now() + expiresIn }), error: null } : { data: null, error: null })),
      from: () => ({
        update: () => ({ eq: async () => ({}) }),
        insert: async (row: unknown) => {
          inserted.push(row);
          return { error: null };
        },
      }),
    };
    return { db, inserted };
  }

  it("Microsoft Graph : sendMail avec destinataire et PDF joint, puis archivé dans le fil", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => (calls.push({ url, init }), new Response(null, { status: 202 }))));
    const { OAuthMailProvider } = await import("@/lib/integrations/mail");
    const { db, inserted } = await fakeDb();
    const p = new OAuthMailProvider(db as never, "org", "microsoft", "contact@strato.test");
    const r = await p.send({ to: "client@x.test", subject: "Devis DEV-1", body: "Bonjour", threadId: "t1", author: "Karim", attachments: [{ name: "DEV-1.pdf", url: "/x", load: async () => ({ data: Buffer.from("%PDF"), mime: "application/pdf" }) }] });
    expect(r).toMatchObject({ ok: true, simulated: false, threadId: "t1" });
    expect(calls[0].url).toBe("https://graph.microsoft.com/v1.0/me/sendMail");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.message.toRecipients[0].emailAddress.address).toBe("client@x.test");
    expect(body.message.attachments[0]).toMatchObject({ name: "DEV-1.pdf", contentBytes: Buffer.from("%PDF").toString("base64") });
    expect(JSON.stringify(inserted)).toContain("Karim (contact@strato.test)");
  });

  it("erreur du fournisseur : rien n'est archivé, l'erreur est remontée", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("quota", { status: 429 })));
    const { OAuthMailProvider } = await import("@/lib/integrations/mail");
    const { db, inserted } = await fakeDb();
    const r = await new OAuthMailProvider(db as never, "org", "microsoft", "c@s.test").send({ to: "a@b.test", subject: "S", body: "B", threadId: "t1", author: "K" });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("429");
    expect(inserted).toHaveLength(0);
  });
});

describe("agenda partagé", () => {
  it("absence sur plusieurs jours : journée entière, fin exclusive, selon le fournisseur", async () => {
    const { providerPayload } = await import("@/lib/integrations/calendar");
    const e = { title: "Absence — Léa", start: "2026-11-02", end: "2026-11-06", allDay: true };
    expect(providerPayload("google", e, "Europe/Paris")).toMatchObject({ summary: "Absence — Léa", start: { date: "2026-11-02" }, end: { date: "2026-11-07" } });
    expect(providerPayload("microsoft", e, "Europe/Paris")).toMatchObject({ isAllDay: true, start: { dateTime: "2026-11-02T00:00:00", timeZone: "Europe/Paris" }, end: { dateTime: "2026-11-07T00:00:00" }, showAs: "oof" });
    expect(providerPayload("microsoft", { title: "Maintenance FDM-05", start: "2026-10-22T05:00:00Z", end: "2026-10-22T10:00:00Z" }, "Europe/Paris")).toMatchObject({ start: { dateTime: "2026-10-22T05:00:00", timeZone: "UTC" } });
  });
});
