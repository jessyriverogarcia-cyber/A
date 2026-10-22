import "server-only";
import path from "node:path";
import { Font } from "@react-pdf/renderer";

/**
 * Police Inter embarquée dans les PDF (licence SIL OFL 1.1, assets/fonts/OFL-Inter.txt) :
 * exigée par PDF/A-3 — les polices standard (Helvetica) ne sont pas incorporées.
 */
const dir = path.join(process.cwd(), "assets", "fonts");
Font.register({
  family: "Inter",
  fonts: [
    { src: path.join(dir, "Inter-Regular.otf"), fontWeight: 400 },
    { src: path.join(dir, "Inter-SemiBold.otf"), fontWeight: 600 },
  ],
});
// Pas de césure automatique (mots tronqués dans les désignations)
Font.registerHyphenationCallback((word) => [word]);

export const PDF_FONT = "Inter";
