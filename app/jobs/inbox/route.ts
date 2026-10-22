import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncInbox } from "@/lib/integrations/inbox";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const authorized = (req: Request) => {
  const secret = process.env.CRON_SECRET ?? "";
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return secret.length >= 16 && got.length === secret.length && timingSafeEqual(Buffer.from(got), Buffer.from(secret));
};

/**
 * Relève planifiée des boîtes connectées (Vercel Cron, ou pg_net), protégée par CRON_SECRET.
 * Une organisation en erreur n'empêche pas les autres.
 */
async function run(req: Request) {
  if (!authorized(req)) return new Response("Non autorisé", { status: 401 });
  const admin = createAdminClient();
  const { data: orgs } = await admin.from("integration_accounts").select("org_id");
  const results: Record<string, unknown> = {};
  for (const orgId of new Set((orgs ?? []).map((o) => o.org_id))) {
    try {
      results[orgId] = await syncInbox(admin, orgId);
    } catch (e) {
      results[orgId] = { error: e instanceof Error ? e.message : "erreur" };
      await admin.from("integration_accounts").update({ last_error: `Relève : ${e instanceof Error ? e.message : "erreur"}` }).eq("org_id", orgId);
    }
  }
  return Response.json(results);
}

export const GET = run;
export const POST = run;
