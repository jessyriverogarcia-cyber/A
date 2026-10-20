"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { DEMO_ACCOUNTS, demoEmail, isDemoMode } from "@/lib/demo";

export type AuthState = { error?: string; info?: string } | undefined;

const safeNext = (next: FormDataEntryValue | null) => {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/";
};

/** Après une connexion par mot de passe : si un facteur TOTP existe, on exige le code. */
async function finishSignIn(next: string): Promise<never> {
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (data?.nextLevel === "aal2" && data.currentLevel !== "aal2") {
    redirect(`/login?mfa=1&next=${encodeURIComponent(next)}`);
  }
  redirect(next);
}

const credentials = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function signInWithPassword(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "invalid" };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "invalid" };
  return finishSignIn(safeNext(form.get("next")));
}

export async function signInDemo(form: FormData) {
  const login = String(form.get("login"));
  if (!isDemoMode() || !DEMO_ACCOUNTS.some((a) => a.login === login)) redirect("/login");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: demoEmail(login),
    password: process.env.DEMO_PASSWORD ?? "",
  });
  if (error) redirect("/login?error=demo");
  await finishSignIn(safeNext(form.get("next")));
}

export async function sendMagicLink(_: AuthState, form: FormData): Promise<AuthState> {
  const email = z.string().email().safeParse(form.get("email"));
  if (!email.success) return { error: "invalid" };
  const supabase = await createClient();
  const next = safeNext(form.get("next"));
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: {
      shouldCreateUser: false, // seuls les comptes existants peuvent se connecter
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  // Même réponse que le compte existe ou non (pas d'énumération des comptes).
  if (error && error.status !== 422 && error.status !== 400) return { error: "invalid" };
  return { info: "sent" };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
