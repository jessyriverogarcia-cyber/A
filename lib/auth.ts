import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Action, Module } from "@/lib/domain/permissions";

export interface UserContext {
  user_id: string;
  full_name: string;
  locale: string;
  employee_id: string | null;
  org: { id: string; name: string; currency: string; vat_rate: number };
  role: { id: string; key: string; label: string; read_only: boolean; can_see_salaries: boolean };
  permissions: string[];
}

/** Contexte de l'utilisateur connecté, mis en cache pour la durée de la requête. */
export const getUserContext = cache(async (): Promise<UserContext | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_context");
  if (error || !data) return null;
  return data as UserContext;
});

export async function requireUser(): Promise<UserContext> {
  const ctx = await getUserContext();
  if (!ctx) redirect("/login");
  return ctx;
}

export function can(ctx: Pick<UserContext, "permissions">, module: Module, action: Action = "read") {
  return ctx.permissions.includes(`${module}:${action}`);
}
