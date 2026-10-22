import { execSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "default" });
test.beforeAll(() => execSync("pnpm db:seed", { stdio: "ignore" }));

async function login(page: Page, who: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByTestId(`demo-${who}`).click();
  await page.waitForURL((u) => u.pathname.startsWith(next.split("?")[0]));
}

async function openWo(page: Page, text: string) {
  await page.goto("/ops/work-orders");
  await page.locator("[data-testid^=wo-card-]").filter({ hasText: text }).first().click();
  await page.waitForURL(/\/ops\/work-orders\/[0-9a-f-]{36}/);
}

test("à faire aujourd'hui : tuiles de l'atelier", async ({ page }) => {
  await login(page, "production", "/ops");
  const tiles = page.getByTestId("ops-tiles");
  await expect(tiles).toContainText("Contrôle qualité en attente");
  await expect(tiles).toContainText("Machines arrêtées");
  await expect(tiles).toContainText("FDM-05");
  await page.screenshot({ path: "test-results/screens/30-ops-todo.png", fullPage: true });
});

test("passer en impression en réservant une machine", async ({ page }) => {
  await login(page, "production", "/ops/work-orders");
  await page.screenshot({ path: "test-results/screens/31-ops-board.png", fullPage: true });
  await openWo(page, "HV-2");
  await expect(page.getByTestId("wo-stage")).toHaveText("Slicing / programmation");
  const select = page.getByTestId("next-machine");
  const value = await select.locator("option", { hasText: "GANTRY-02" }).getAttribute("value");
  await select.selectOption(value!);
  await page.getByTestId("wo-next").click();
  await expect(page.getByTestId("flash")).toContainText("Impression");
  await expect(page.getByTestId("wo-stage")).toHaveText("Impression");
  await expect(page.getByText("GANTRY-02 · Portique grand format Bêta")).toBeVisible();
  // Un saut d'étape est refusé côté serveur (règle du domaine), même si le formulaire était forgé.
});

test("qualité : valider le contrôle puis expédier", async ({ page }) => {
  await login(page, "qualite", "/ops/work-orders");
  await openWo(page, "maquette soufflerie 1:20");
  await expect(page.getByTestId("wo-stage")).toHaveText("Contrôle qualité");
  await page.screenshot({ path: "test-results/screens/32-ops-wo-quality.png", fullPage: true });
  await page.getByTestId("qc-accept").click();
  await expect(page.getByTestId("flash")).toContainText("Contrôle qualité validé");
  await expect(page.getByTestId("wo-stage")).toHaveText("Expédition");
  await page.getByTestId("wo-ship").click();
  await expect(page.getByTestId("wo-stage")).toHaveText("Expédié");
});

test("opérateur : saisit ses heures, ne valide pas la qualité", async ({ page }) => {
  await login(page, "operateur", "/ops/work-orders");
  await openWo(page, "Pinces de préhension");
  const before = await page.getByTestId("wo-budget").innerText();
  await page.getByTestId("time-hours").fill("2");
  await page.getByTestId("time-submit").click();
  await expect(page.getByTestId("flash")).toContainText("2 h enregistrées");
  await expect(page.getByTestId("wo-budget")).not.toHaveText(before);
  await expect(page.getByTestId("qc-accept")).toHaveCount(0);
});

test("planning machines et lien profond depuis la Map", async ({ page }) => {
  await login(page, "production", "/ops/planning");
  await expect(page.getByTestId("planning")).toContainText("GANTRY-02");
  await expect(page.getByTestId("planning").locator("a[href^='/ops/work-orders/']").first()).toBeVisible();
  await page.screenshot({ path: "test-results/screens/33-ops-planning.png", fullPage: true });
  const href = await page.getByTestId("planning").locator("a[href^='/ops/work-orders/']").first().getAttribute("href");
  await page.goto(`/ops?wo=${href!.split("/").pop()}`);
  await expect(page).toHaveURL(/\/ops\/work-orders\/[0-9a-f-]{36}/);
});
