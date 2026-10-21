import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { can, getUserContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AI_MODEL, runAssistant, type AiEvent } from "@/lib/ai/assistant";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z.object({ conversation_id: z.string().uuid().nullable().optional(), message: z.string().trim().min(1).max(4000) });

/**
 * Un tour de conversation, diffusé en NDJSON (une ligne JSON par événement : texte, outil, lien,
 * proposition, fin). La clé API ne quitte jamais le serveur.
 */
export async function POST(req: Request) {
  const ctx = await getUserContext();
  if (!ctx) return new Response("Non autorisé", { status: 401 });
  if (!can(ctx, "ai")) return new Response("Assistant non accessible pour ce rôle", { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("Requête invalide", { status: 400 });
  const db = await createClient();

  let conversationId = parsed.data.conversation_id ?? null;
  if (!conversationId) {
    const { data, error } = await db.from("ai_conversations").insert({ org_id: ctx.org.id, user_id: ctx.user_id, title: parsed.data.message.slice(0, 80) }).select("id").single();
    if (error) return new Response(error.message, { status: 500 });
    conversationId = data.id;
  }
  const { data: rows } = await db.from("ai_messages").select("role, content").eq("conversation_id", conversationId).order("id");
  const history = (rows ?? []).map((r) => ({ role: r.role, content: r.content }) as Anthropic.Beta.BetaMessageParam);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AiEvent | { type: "conversation"; id: string }) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      emit({ type: "conversation", id: conversationId! });
      try {
        const out = await runAssistant({ db, ctx, history, userText: parsed.data.message, emit, signal: req.signal });
        // Historique en ajout seul : chaque message de l'API est conservé tel quel (blocs de réflexion compris).
        await db.from("ai_messages").insert(
          out.messages.map((m, i) => ({
            org_id: ctx.org.id,
            conversation_id: conversationId!,
            role: m.role,
            content: (typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content) as never,
            text: i === 0 ? parsed.data.message : i === out.messages.length - 1 && m.role === "assistant" ? out.text : null,
            tools: i === out.messages.length - 1 ? out.tools : [],
            model: m.role === "assistant" ? (out.simulated ? "simulation" : AI_MODEL) : null,
            simulated: out.simulated,
            input_tokens: i === out.messages.length - 1 ? out.usage.input : null,
            output_tokens: i === out.messages.length - 1 ? out.usage.output : null,
          })),
        );
        await db.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId!);
      } catch (e) {
        emit({ type: "error", message: e instanceof Error ? e.message : "Erreur de l'assistant" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
