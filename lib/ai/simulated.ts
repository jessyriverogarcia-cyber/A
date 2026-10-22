import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { UserContext } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/format";
import { runTool, toolLabel, toolsFor } from "./tools";
import type { AiEvent } from "./assistant";

type Db = SupabaseClient<Database>;

/** Intentions reconnues sans IA : mots-clés → un outil et sa mise en forme. */
const INTENTS: { re: RegExp; tool: string; input: (q: string) => Record<string, unknown> }[] = [
  { re: /factur|impay|échu|echu|encaiss/i, tool: "factures", input: () => ({ filtre: "echues" }) },
  { re: /retard/i, tool: "lister_dossiers", input: () => ({ filtre: "en_retard" }) },
  { re: /(contrôle|controle) qualit|\bcq\b/i, tool: "lister_dossiers", input: () => ({ filtre: "controle_qualite" }) },
  { re: /expédi|expedi/i, tool: "lister_dossiers", input: () => ({ filtre: "a_expedier" }) },
  { re: /\bOF-\d{4}-\d+/i, tool: "fiche_dossier", input: (q) => ({ numero: q.match(/OF-\d{4}-\d+/i)![0].toUpperCase() }) },
  { re: /stock|matière|matiere|poudre|résine|resine|filament/i, tool: "etat_stock", input: () => ({ sous_minimum: true }) },
  { re: /présen|presen|absent|équipe|equipe|congé|conge/i, tool: "presence_equipe", input: () => ({}) },
  { re: /message|répond|repond|mail|boîte|boite/i, tool: "messages_a_repondre", input: () => ({}) },
  { re: /chiffre|\bca\b|trésor|tresor|pipeline|pilotage|synthèse|synthese|bilan/i, tool: "indicateurs_direction", input: () => ({}) },
];

type Row = Record<string, unknown>;
const list = (rows: Row[], fmt: (r: Row) => string, empty: string, max = 8) =>
  rows.length ? rows.slice(0, max).map((r) => `- ${fmt(r)}`).join("\n") + (rows.length > max ? `\n- … et ${rows.length - max} autre(s)` : "") : empty;

function format(tool: string, result: unknown): string {
  const rows = Array.isArray(result) ? (result as Row[]) : [];
  const r = (result ?? {}) as Row;
  if (r.erreur) return String(r.erreur);
  switch (tool) {
    case "factures":
      return `${rows.length} facture(s) échue(s) :\n` + list(rows, (f) => `${f.numero} — ${f.client} : ${formatMoney(Number(f.reste_du))} restant dû, échue le ${formatDate(String(f.echeance))}`, "Aucune facture échue.");
    case "lister_dossiers":
      return `${rows.length} dossier(s) :\n` + list(rows, (w) => `${w.numero} — ${w.titre} (${w.client ?? "client masqué"}) · étape « ${w.etape} » · ${w.avancement} % · échéance ${w.echeance ? formatDate(String(w.echeance)) : "—"}`, "Aucun dossier dans ce cas.");
    case "fiche_dossier":
      return `${r.numero} — ${r.titre}\nClient : ${r.client ?? "—"} · étape « ${r.etape} » (${r.avancement} %) · échéance ${r.echeance ? formatDate(String(r.echeance)) : "—"}\nHeures : ${r.heures_passees} h passées sur ${r.heures_budget} h prévues.`;
    case "etat_stock":
      return `${rows.length} article(s) sous le minimum :\n` + list(rows, (s) => `${s.article} : ${s.quantite} ${s.unite} (minimum ${s.minimum}) — ${s.fournisseur ?? "fournisseur ?"}`, "Tout le stock est au-dessus du minimum.");
    case "presence_equipe": {
      const by = (st: string) => rows.filter((p) => p.etat === st).map((p) => p.nom);
      return `Présents : ${by("at_station").length + by("in_meeting").length} · en pause : ${by("on_break").join(", ") || "personne"} · en congé : ${by("congé").join(", ") || "personne"} · absents : ${by("absent").join(", ") || "personne"}.`;
    }
    case "messages_a_repondre":
      return `${rows.length} échange(s) attendent une réponse :\n` + list(rows, (t) => `${t.sujet}${t.brouillon_pret ? " — brouillon prêt" : ""}`, "Tout est répondu.");
    case "indicateurs_direction": {
      const a = (r.alerts as Row[]) ?? [];
      return `Décisions à prendre :\n` + list(a, (x) => `${x.title} — ${x.detail}`, "Rien à arbitrer.", 6);
    }
    default:
      return JSON.stringify(result).slice(0, 800);
  }
}

/**
 * Mode simulé (aucune clé API configurée) : réponses à base de règles sur les mêmes outils,
 * avec les mêmes droits. Annoncé comme tel à l'utilisateur — ce n'est pas de l'IA.
 */
export async function simulatedAnswer(db: Db, ctx: UserContext, question: string, emit: (e: AiEvent) => void) {
  const allowed = new Set(toolsFor(ctx).map((t) => t.name));
  const intent = INTENTS.find((i) => i.re.test(question) && allowed.has(i.tool));
  let text: string;
  const tools: string[] = [];
  if (!intent) {
    const examples = ["« Quelles factures sont en retard ? »", "« Quels dossiers sont en retard ? »", "« Où en est OF-2026-0007 ? »", "« Quel stock est bas ? »", "« Qui est présent ? »", "« Quels messages attendent une réponse ? »"];
    text = `Mode simulé : aucune clé API Claude n'est configurée, je ne comprends que quelques questions types, par exemple ${examples.join(", ")}.`;
  } else {
    emit({ type: "tool", name: intent.tool, label: toolLabel(intent.tool), status: "start" });
    const r = await runTool(db, ctx, intent.tool, intent.input(question));
    tools.push(intent.tool);
    emit({ type: "tool", name: intent.tool, label: toolLabel(intent.tool), status: r.error ? "error" : "done" });
    if (r.link) emit({ type: "link", ...r.link });
    text = `${format(intent.tool, r.result)}\n\n(Réponse simulée sans IA, à partir des données réelles.)`;
  }
  for (const chunk of text.match(/.{1,40}(\s|$)/gs) ?? [text]) emit({ type: "text", delta: chunk });
  return { text, tools };
}
