import type { MapEmployee, MapVisitor } from "./types";

/** Le visiteur arrive un peu avant l'heure du rendez-vous et repart à la fin. */
export const ARRIVAL_MARGIN_MS = 10 * 60_000;

/** Visiteurs présents sur le site à l'instant donné (rendez-vous client en cours). */
export function visitorsOnSite(visitors: MapVisitor[], now: number): MapVisitor[] {
  return visitors.filter((v) => Date.parse(v.starts_at) - ARRIVAL_MARGIN_MS <= now && now < Date.parse(v.ends_at));
}

/** Avatar d'un visiteur : même gabarit qu'un salarié, tenue de ville et prénom / nom du contact. */
export function visitorAvatar(v: MapVisitor): MapEmployee {
  const [first, ...rest] = (v.contact_name ?? "Visiteur").split(" ");
  let h = 0;
  for (const c of v.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return {
    id: `visitor:${v.id}`,
    first_name: first,
    last_name: rest.join(" "),
    job_title: v.client_name,
    role_key: null,
    avatar_color: "#2b3a55",
    appearance: { skin: h % 4, hair: h % 3, hairColor: ["#2b2b2b", "#6b4a2b", "#a3a3a3"][h % 3] },
    home_zone_id: null,
    site_id: null,
  };
}
