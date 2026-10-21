import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Chiffrement des jetons OAuth (AES-256-GCM). La clé vient de INTEGRATIONS_SECRET (serveur
 * uniquement) : sans elle, le texte stocké en base est inutilisable.
 */
function key() {
  const secret = process.env.INTEGRATIONS_SECRET;
  if (!secret || secret.length < 32) throw new Error("INTEGRATIONS_SECRET manquant (32 caractères minimum).");
  return createHash("sha256").update(secret).digest();
}

export function seal(data: unknown): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(JSON.stringify(data), "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function open<T>(sealed: string): T {
  const [v, iv, tag, body] = sealed.split(".");
  if (v !== "v1") throw new Error("Format de jeton inconnu.");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(body, "base64url")), d.final()]).toString("utf8")) as T;
}

/** PKCE : vérificateur aléatoire et son défi S256. */
export function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}
