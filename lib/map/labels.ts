"use client";

import type { Vec3 } from "./types";

/**
 * Étiquettes de la Map : une seule couche DOM au-dessus du canvas, positionnée à chaque image
 * par projection (plus léger et plus robuste qu'une racine React par étiquette).
 */
export const labelElements = new Map<string, HTMLElement>();
export const labelAnchors = new Map<string, () => Vec3 | null>();
/** Positions courantes des personnes (mises à jour par leur animation). */
export const livePositions = new Map<string, Vec3>();
