import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { can, getUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { seal } from "@/lib/integrations/crypto";
import { exchangeCode, PROVIDERS, type ProviderId } from "@/lib/integrations/oauth";

/** Retour OAuth : vérification de l'état, échange du code (PKCE), jetons chiffrés puis stockés. */
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(req.url);
  const done = (k: "ok" | "err", m: string) => NextResponse.redirect(new URL(`/settings/integrations?${k}=${encodeURIComponent(m)}`, req.url));
  const ctx = await getUserContext();
  if (!ctx || !can(ctx, "settings", "update")) return done("err", "Réservé à la direction.");
  if (provider !== "microsoft" && provider !== "google") return done("err", "Fournisseur inconnu.");
  const jar = await cookies();
  const state = jar.get("oauth_state")?.value;
  const verifier = jar.get("oauth_verifier")?.value;
  jar.delete({ name: "oauth_state", path: "/settings/integrations" });
  jar.delete({ name: "oauth_verifier", path: "/settings/integrations" });
  if (url.searchParams.get("error")) return done("err", url.searchParams.get("error_description") ?? "Connexion refusée.");
  if (!state || state !== url.searchParams.get("state") || !verifier) return done("err", "Session de connexion expirée, recommencez.");
  try {
    const p = provider as ProviderId;
    const tokens = await exchangeCode(p, url.searchParams.get("code") ?? "", verifier);
    const email = await PROVIDERS[p].profile(tokens.access_token);
    const db = await createClient();
    const { error } = await db.rpc("save_integration", { p_provider: p, p_email: email, p_scopes: (tokens.scope ?? "").split(" ").filter(Boolean), p_ciphertext: seal(tokens) });
    if (error) return done("err", error.message);
    await db.from("activity_events").insert({ org_id: ctx.org.id, type: "integration.connected", entity_type: "integration", actor: ctx.user_id, payload: { provider: p, account: email } });
    return done("ok", `${PROVIDERS[p].label} connecté : ${email}. Les e-mails partent désormais réellement.`);
  } catch (e) {
    return done("err", e instanceof Error ? e.message : "Connexion impossible.");
  }
}
