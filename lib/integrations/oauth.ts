import "server-only";

export type ProviderId = "microsoft" | "google";

export interface Tokens {
  access_token: string;
  refresh_token?: string;
  expires_at: number; // ms epoch
  scope?: string;
}

interface ProviderDef {
  label: string;
  authorizeUrl: () => string;
  tokenUrl: () => string;
  scopes: string[];
  clientId: () => string | undefined;
  clientSecret: () => string | undefined;
  extraAuthParams: Record<string, string>;
  profile: (accessToken: string) => Promise<string>;
}

const tenant = () => process.env.MS_TENANT_ID || "common";

export const PROVIDERS: Record<ProviderId, ProviderDef> = {
  microsoft: {
    label: "Microsoft 365 (Outlook)",
    authorizeUrl: () => `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/authorize`,
    tokenUrl: () => `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`,
    scopes: ["offline_access", "openid", "email", "User.Read", "Mail.Send", "Calendars.ReadWrite"],
    clientId: () => process.env.MS_CLIENT_ID,
    clientSecret: () => process.env.MS_CLIENT_SECRET,
    extraAuthParams: { response_mode: "query" },
    async profile(token) {
      const r = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(`Profil Microsoft : HTTP ${r.status}`);
      const j = (await r.json()) as { mail?: string; userPrincipalName?: string };
      return j.mail ?? j.userPrincipalName ?? "compte Microsoft";
    },
  },
  google: {
    label: "Google Workspace (Gmail)",
    authorizeUrl: () => "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: () => "https://oauth2.googleapis.com/token",
    scopes: ["openid", "email", "https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/calendar.events"],
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
    extraAuthParams: { access_type: "offline", prompt: "consent" },
    async profile(token) {
      const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(`Profil Google : HTTP ${r.status}`);
      return ((await r.json()) as { email?: string }).email ?? "compte Google";
    },
  },
};

/** Une intégration est « configurable » quand l'application a ses identifiants et la clé de chiffrement. */
export const configured = (p: ProviderId) => !!(PROVIDERS[p].clientId() && PROVIDERS[p].clientSecret() && (process.env.INTEGRATIONS_SECRET ?? "").length >= 32);

export const redirectUri = (p: ProviderId) => `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/settings/integrations/${p}/callback`;

export function authorizeUrl(p: ProviderId, state: string, challenge: string) {
  const d = PROVIDERS[p];
  const q = new URLSearchParams({
    client_id: d.clientId()!,
    response_type: "code",
    redirect_uri: redirectUri(p),
    scope: d.scopes.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...d.extraAuthParams,
  });
  return `${d.authorizeUrl()}?${q}`;
}

async function tokenRequest(p: ProviderId, params: Record<string, string>): Promise<Tokens> {
  const d = PROVIDERS[p];
  const r = await fetch(d.tokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: d.clientId()!, client_secret: d.clientSecret()!, ...params }),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error_description?: string; error?: string };
  if (!r.ok || !j.access_token) throw new Error(j.error_description ?? j.error ?? `HTTP ${r.status}`);
  return { access_token: j.access_token, refresh_token: j.refresh_token ?? params.refresh_token, expires_at: Date.now() + (j.expires_in ?? 3600) * 1000, scope: j.scope };
}

export const exchangeCode = (p: ProviderId, code: string, verifier: string) =>
  tokenRequest(p, { grant_type: "authorization_code", code, redirect_uri: redirectUri(p), code_verifier: verifier });

export const refresh = (p: ProviderId, refreshToken: string) => tokenRequest(p, { grant_type: "refresh_token", refresh_token: refreshToken });
