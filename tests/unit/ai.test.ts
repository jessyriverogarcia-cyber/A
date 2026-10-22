import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserContext } from "@/lib/auth";

/**
 * Boucle de l'assistant contre une fausse API Messages locale (flux SSE) : on vérifie la forme
 * des requêtes envoyées à Claude et l'enchaînement outil → résultat → réponse, sans clé réelle.
 */
const bodies: Record<string, unknown>[] = [];
const headers: http.IncomingHttpHeaders[] = [];
let server: http.Server;

function sse(events: [string, object][]) {
  return events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify({ type: e, ...d })}\n\n`).join("");
}
const start = (id: string) => ["message_start", { message: { id, type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 0 } } }] as [string, object];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw);
      bodies.push(body);
      headers.push(req.headers);
      res.writeHead(200, { "content-type": "text/event-stream" });
      if (bodies.length === 1) {
        res.end(
          sse([
            start("msg_1"),
            ["content_block_start", { index: 0, content_block: { type: "tool_use", id: "toolu_1", name: "etat_stock", input: {} } }],
            ["content_block_delta", { index: 0, delta: { type: "input_json_delta", partial_json: '{"sous_minimum": true}' } }],
            ["content_block_stop", { index: 0 }],
            ["message_delta", { delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 20 } }],
            ["message_stop", {}],
          ]),
        );
      } else {
        res.end(
          sse([
            start("msg_2"),
            ["content_block_start", { index: 0, content_block: { type: "text", text: "" } }],
            ["content_block_delta", { index: 0, delta: { type: "text_delta", text: "Un article est sous le minimum : résine." } }],
            ["content_block_stop", { index: 0 }],
            ["message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 12 } }],
            ["message_stop", {}],
          ]),
        );
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.close();
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_BASE_URL;
});

/** Faux client Supabase : juste ce que l'outil etat_stock lit. */
const fakeDb = {
  from: () => ({
    select: () => ({
      order: async () => ({
        data: [
          { sku: "RES-BIO", label: "Résine biocompatible", quantity: 4, min_quantity: 6, unit: "L", suppliers: { name: "RésinaLab" } },
          { sku: "PA12", label: "Filament PA12", quantity: 40, min_quantity: 10, unit: "kg", suppliers: null },
        ],
      }),
    }),
  }),
};
const ctx = { user_id: "u", full_name: "Test", employee_id: null, locale: "fr-FR", org: { id: "o", name: "Strato Fab", currency: "EUR", vat_rate: 0.2 }, role: { id: "r", key: "operator", label: "Opérateur", read_only: false, can_see_salaries: false }, permissions: ["resources:read", "ai:read"] } as UserContext;

describe("assistant IA", () => {
  it("appelle Claude avec les bons paramètres, exécute l'outil sous les droits du rôle et répond", async () => {
    const { runAssistant } = await import("@/lib/ai/assistant");
    const events: { type: string }[] = [];
    const out = await runAssistant({ db: fakeDb as never, ctx, history: [], userText: "Quel stock est bas ?", emit: (e) => events.push(e) });

    expect(out.simulated).toBe(false);
    expect(out.text).toContain("résine");
    expect(out.tools).toEqual(["etat_stock"]);
    expect(bodies).toHaveLength(2);
    const first = bodies[0] as { model: string; fallbacks: string; thinking: object; output_config: object; tools: { name: string; eager_input_streaming?: boolean }[]; stream: boolean };
    expect(first.model).toBe("claude-opus-5-5");
    expect(first.fallbacks).toBe("default");
    expect(first.thinking).toEqual({ type: "adaptive" });
    expect(first.output_config).toEqual({ effort: "medium" });
    expect(first.stream).toBe(true);
    expect(headers[0]["anthropic-beta"]).toContain("server-side-fallback-2026-07-01");
    // Seuls les outils permis par le rôle sont proposés (ici : stock, rien de la finance)
    expect(first.tools.map((t) => t.name)).toEqual(["etat_stock"]);
    expect(first.tools[0].eager_input_streaming).toBe(true);
    // Le second appel rejoue l'appel d'outil et son résultat, filtré sur les articles bas
    const second = bodies[1] as { messages: { role: string; content: { type: string; content?: string }[] }[] };
    const result = second.messages.at(-1)!.content[0];
    expect(result.type).toBe("tool_result");
    expect(JSON.parse(result.content!)).toEqual([expect.objectContaining({ sku: "RES-BIO", niveau: expect.any(String) })]);
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(["tool", "link", "text", "done"]));
    // Historique en ajout seul : user, assistant(tool_use), user(tool_result), assistant(texte)
    expect(out.messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
  });
});
