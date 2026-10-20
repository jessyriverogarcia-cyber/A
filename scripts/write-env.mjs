// Écrit .env.local à partir de l'instance Supabase locale (supabase status).
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const env = Object.fromEntries(
  execSync("pnpm exec supabase status -o env", { encoding: "utf8" })
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
writeFileSync(
  ".env.local",
  `# Généré par scripts/write-env.mjs pour Supabase local. Ne pas committer.
NEXT_PUBLIC_SUPABASE_URL=${env.API_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${env.ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${env.SERVICE_ROLE_KEY}
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_DEMO_MODE=true
DEMO_PASSWORD=StratoFab-demo-2026
`,
);
console.log("✔ .env.local écrit");
