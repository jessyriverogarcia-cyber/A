import { execSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.beforeAll(() => execSync("pnpm db:seed", { stdio: "ignore" }));

async function login(page: Page, who: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByTestId(`demo-${who}`).click();
  await page.waitForURL((u) => u.pathname.startsWith(next.split("?")[0]));
}

// Sans clé API dans l'environnement de test : l'assistant tourne en mode simulé, annoncé comme tel.
test("assistant (mode simulé) : réponse fondée sur les données, conversation conservée", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "compta", "/ai");
  await expect(page.getByText("Mode simulé — aucune clé API")).toBeVisible();
  await page.getByTestId("suggestion").filter({ hasText: "factures" }).click();
  const answer = page.getByTestId("assistant-turn").last();
  await expect(answer).toContainText(/facture\(s\) échue\(s\)/, { timeout: 15_000 });
  await expect(answer).toContainText(/FAC-\d{4}-\d+/);
  await expect(answer).toContainText("mode simulé");
  await expect(answer.getByRole("link", { name: /Factures/ })).toBeVisible();
  await page.waitForURL(/\/ai\?c=/);
  await page.screenshot({ path: "test-results/screens/90-ai.png", fullPage: true });

  await page.reload();
  await expect(page.getByTestId("user-turn")).toContainText("Quelles factures sont en retard ?");
  await expect(page.getByTestId("assistant-turn")).toContainText(/FAC-\d{4}-\d+/);
  expect(errors).toEqual([]);
});

test("assistant : les outils suivent les droits du rôle", async ({ page }) => {
  await login(page, "operateur", "/ai");
  // L'opérateur n'a pas accès à la Finance : la question ne peut pas y répondre
  await page.getByTestId("chat-input").fill("Quelles factures sont impayées ?");
  await page.getByTestId("chat-send").click();
  const answer = page.getByTestId("assistant-turn").last();
  await expect(answer).toContainText("Mode simulé", { timeout: 15_000 });
  await expect(answer).not.toContainText(/FAC-\d{4}/);
  await page.getByTestId("chat-input").fill("Quels dossiers sont en retard ?");
  await page.getByTestId("chat-send").click();
  await expect(page.getByTestId("assistant-turn").last()).toContainText(/OF-\d{4}-\d+/, { timeout: 15_000 });
});
