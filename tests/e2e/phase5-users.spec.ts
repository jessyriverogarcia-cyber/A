import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
test.beforeAll(() => execSync("pnpm db:seed", { stdio: "ignore" }));

async function login(page: Page, who: string, next: string) {
  await page.context().clearCookies();
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByTestId(`demo-${who}`).click();
  await page.waitForURL((u) => u.pathname.startsWith(next.split("?")[0]));
}

test("direction : inviter, changer le rôle, retirer l'accès ; garde-fous", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await login(page, "direction", "/settings/users");
  await expect(page.getByTestId("user-row")).toHaveCount(9);
  await page.getByTestId("invite-email").fill("nouvelle.recrue@strato-fab.test");
  await page.getByTestId("invite-name").fill("Nina Recrue");
  await page.getByTestId("invite-role").selectOption({ label: "Opérateur" });
  await page.getByTestId("invite-submit").click();
  await expect(page.getByTestId("flash")).toContainText("Invitation envoyée à nouvelle.recrue@strato-fab.test");
  const row = page.getByTestId("user-row").filter({ hasText: "Nina Recrue" });
  await expect(row).toContainText("invité");
  // L'e-mail d'invitation est parti (Mailpit local)
  const mail = await (await page.request.get("http://127.0.0.1:54324/api/v1/search?query=to:nouvelle.recrue@strato-fab.test")).json();
  expect(mail.total).toBeGreaterThan(0);

  await row.getByRole("combobox").selectOption({ label: "Qualité" });
  await row.getByRole("button", { name: "OK" }).click();
  await expect(page.getByTestId("flash")).toContainText("Nina Recrue : rôle « Qualité »");
  await page.screenshot({ path: "test-results/screens/98-utilisateurs.png", fullPage: true });

  await page.getByTestId("revoke-Nina Recrue").click();
  await expect(page.getByTestId("flash")).toContainText("Accès retiré à Nina Recrue");
  await expect(page.getByTestId("user-row").filter({ hasText: "Nina Recrue" })).toHaveCount(0);
  // Doublon refusé
  await page.getByTestId("invite-email").fill("rh@strato-fab.test");
  await page.getByTestId("invite-name").fill("Doublon");
  await page.getByTestId("invite-role").selectOption({ label: "Opérateur" });
  await page.getByTestId("invite-submit").click();
  await expect(page.getByTestId("flash")).toContainText("existe déjà");
});

test("compte sans profil (SSO, lien) : message d'accès refusé, pas de boucle", async ({ page }) => {
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  await admin.auth.admin.createUser({ email: "sans.profil@strato-fab.test", password: "Sans-Profil-2026!", email_confirm: true });
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Adresse e-mail" }).fill("sans.profil@strato-fab.test");
  await page.locator("input[name=password]").fill("Sans-Profil-2026!");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByTestId("no-access")).toBeVisible();
  await expect(page).toHaveURL(/error=no_access/);
  // SSO : boutons inactifs tant que les fournisseurs ne sont pas configurés
  await expect(page.getByTestId("sso-azure")).toBeDisabled();
});

test("relève planifiée : refusée sans secret", async ({ request }) => {
  expect((await request.get("/jobs/inbox")).status()).toBe(401);
  expect((await request.get("/jobs/inbox", { headers: { Authorization: "Bearer mauvais-secret-de-test" } })).status()).toBe(401);
});
