"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Ouvrir une notification la marque comme lue (RLS : uniquement les siennes). */
export async function openNotificationAction(form: FormData) {
  await requireUser();
  const db = await createClient();
  const id = String(form.get("id"));
  const { data } = await db.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).select("link").maybeSingle();
  const link = data?.link;
  redirect(link && link.startsWith("/") ? link : "/notifications");
}

export async function markAllReadAction() {
  const ctx = await requireUser();
  const db = await createClient();
  await db.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", ctx.user_id).is("read_at", null);
  redirect("/notifications?ok=" + encodeURIComponent("Tout est marqué comme lu."));
}
