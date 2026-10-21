import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { can, getUserContext } from "@/lib/auth";
import { pkce } from "@/lib/integrations/crypto";
import { authorizeUrl, configured, type ProviderId } from "@/lib/integrations/oauth";

/** Départ OAuth : état anti-CSRF et vérificateur PKCE en cookies httpOnly, puis redirection. */
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const back = new URL("/settings/integrations", req.url);
  const ctx = await getUserContext();
  if (!ctx || !can(ctx, "settings", "update")) return NextResponse.redirect(new URL("/settings/integrations?err=" + encodeURIComponent("Réservé à la direction."), req.url));
  if (provider !== "microsoft" && provider !== "google") return NextResponse.redirect(back);
  if (!configured(provider as ProviderId)) return NextResponse.redirect(new URL("/settings/integrations?err=" + encodeURIComponent("Identifiants de l'application non configurés côté serveur."), req.url));
  const state = randomBytes(16).toString("base64url");
  const { verifier, challenge } = pkce();
  const jar = await cookies();
  const opts = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/settings/integrations", maxAge: 600 };
  jar.set("oauth_state", state, opts);
  jar.set("oauth_verifier", verifier, opts);
  return NextResponse.redirect(authorizeUrl(provider as ProviderId, state, challenge));
}
